import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { Protocol } from 'electron';

import type { EngineMutationResult } from '../../shared/engineProtocol';
import type { AssetDocument } from '../../shared/projectTypes';

export const ASSET_PREVIEW_SCHEME = 'vn-asset';

const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PREVIEW_IMAGE_BYTES = 128 * 1024 * 1024;
const MAGIC_BYTE_COUNT = 12;

type PrivateAssetRecord = AssetDocument & {
  relativePath: string;
};

export type PreparedAssetPreviewProject = {
  projectFilePath: string;
  projectRootPath: string;
  projectId: string;
  assets: Map<string, PrivateAssetRecord>;
};

type ActiveAssetPreviewProject = PreparedAssetPreviewProject & {
  generationToken: string;
  previewTokensByAssetId: Map<string, string>;
  assetIdsByPreviewToken: Map<string, string>;
};

type ProtocolRegistrar = Pick<Protocol, 'handle' | 'unhandle'>;

type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPublicAssetType(
  value: unknown,
): value is AssetDocument['type'] {
  return value === 'image' || value === 'video' || value === 'audio';
}

function isOpaqueAssetId(value: string): boolean {
  // Core's persisted invariant is only "non-empty". The ID remains a Map key
  // and is never interpolated into a path or URL, so preserving arbitrary
  // valid legacy IDs is both compatible and safe.
  return value.length > 0;
}

function isSafeImportedAssetId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function expectedAssetDirectory(type: AssetDocument['type']): string {
  switch (type) {
    case 'image':
      return 'images';
    case 'video':
      return 'videos';
    case 'audio':
      return 'audio';
  }
}

function validateRelativeAssetPath(
  type: AssetDocument['type'],
  relativePath: string,
): void {
  const prefix = `assets/${expectedAssetDirectory(type)}/`;
  const components = relativePath.split('/');

  if (
    !relativePath.startsWith(prefix) ||
    relativePath.length <= prefix.length ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    components.some(
      (component) =>
        component.length === 0 ||
        component === '.' ||
        component === '..',
    )
  ) {
    throw new Error('项目资源清单包含不安全的相对路径');
  }
}

function parsePrivateManifest(
  contents: string,
  projectFilePath: string,
  projectRootPath: string,
): PreparedAssetPreviewProject {
  const document = JSON.parse(contents) as unknown;

  if (
    !isObject(document) ||
    document.format !== 'vn-engine-project' ||
    !isObject(document.project) ||
    typeof document.project.id !== 'string' ||
    !Array.isArray(document.assets)
  ) {
    throw new Error('项目文件不包含有效的资源清单');
  }

  const assets = new Map<string, PrivateAssetRecord>();
  for (const value of document.assets) {
    if (
      !isObject(value) ||
      typeof value.id !== 'string' ||
      !isOpaqueAssetId(value.id) ||
      !isPublicAssetType(value.type) ||
      typeof value.displayName !== 'string' ||
      typeof value.relativePath !== 'string'
    ) {
      throw new Error('项目文件包含无效的资源记录');
    }
    if (assets.has(value.id)) {
      throw new Error('项目文件包含重复的资源 ID');
    }

    validateRelativeAssetPath(value.type, value.relativePath);
    assets.set(value.id, {
      id: value.id,
      type: value.type,
      displayName: value.displayName,
      relativePath: value.relativePath,
    });
  }

  return {
    projectFilePath,
    projectRootPath,
    projectId: document.project.id,
    assets,
  };
}

function sameFileSnapshot(
  left: Stats,
  right: Stats,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.mode === right.mode
  );
}

async function readStableProjectFile(filePath: string): Promise<string> {
  const before = await lstat(filePath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.size > MAX_PROJECT_FILE_BYTES
  ) {
    throw new Error('项目文件不是可安全读取的常规文件');
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(filePath, constants.O_RDONLY | noFollow);
  try {
    const opened = await file.stat();
    if (!sameFileSnapshot(before, opened)) {
      throw new Error('项目文件在读取前发生了变化');
    }

    const contents = await file.readFile({ encoding: 'utf8' });
    const after = await file.stat();
    if (!sameFileSnapshot(opened, after)) {
      throw new Error('项目文件在读取时发生了变化');
    }
    return contents;
  } finally {
    await file.close();
  }
}

function manifestMatchesResult(
  prepared: PreparedAssetPreviewProject,
  result: EngineMutationResult,
): boolean {
  if (
    prepared.projectId !== result.project.id ||
    prepared.assets.size !== result.assets.length
  ) {
    return false;
  }

  return result.assets.every((asset) => {
    const privateAsset = prepared.assets.get(asset.id);
    return (
      privateAsset?.type === asset.type &&
      privateAsset.displayName === asset.displayName
    );
  });
}

function canonicalImageExtension(sourceFilePath: string): string | null {
  switch (path.extname(sourceFilePath).toLowerCase()) {
    case '.png':
      return '.png';
    case '.jpg':
    case '.jpeg':
      return '.jpg';
    case '.webp':
      return '.webp';
    default:
      return null;
  }
}

function imageMimeForPath(relativePath: string): ImageMime | null {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return null;
  }
}

function magicMatches(mime: ImageMime, bytes: Uint8Array): boolean {
  switch (mime) {
    case 'image/png':
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case 'image/jpeg':
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
  }
}

function unavailableResponse(status = 404): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function assertSafeAssetFile(
  projectRootPath: string,
  relativePath: string,
): Promise<{ filePath: string; snapshot: Stats }> {
  const components = relativePath.split('/');
  let currentPath = projectRootPath;

  for (const [index, component] of components.entries()) {
    currentPath = path.join(currentPath, component);
    const status = await lstat(currentPath);
    const isFinalComponent = index === components.length - 1;
    if (
      status.isSymbolicLink() ||
      (isFinalComponent ? !status.isFile() : !status.isDirectory())
    ) {
      throw new Error('资源路径不能包含符号链接');
    }
  }

  const resolvedRoot = await realpath(projectRootPath);
  const resolvedAsset = await realpath(currentPath);
  const containment = path.relative(resolvedRoot, resolvedAsset);
  if (
    containment === '' ||
    containment === '..' ||
    containment.startsWith(`..${path.sep}`) ||
    path.isAbsolute(containment)
  ) {
    throw new Error('资源路径逃逸了项目目录');
  }

  const snapshot = await lstat(resolvedAsset);
  if (
    snapshot.isSymbolicLink() ||
    !snapshot.isFile() ||
    snapshot.nlink !== 1
  ) {
    throw new Error('资源必须是项目内的独立常规文件');
  }

  return { filePath: resolvedAsset, snapshot };
}

function freshGenerationToken(): string {
  return randomUUID().replaceAll('-', '');
}

export class AssetPreviewService {
  private activeProject: ActiveAssetPreviewProject | null = null;
  private disposed = false;

  constructor(private readonly protocol: ProtocolRegistrar) {
    this.protocol.handle(ASSET_PREVIEW_SCHEME, (request) =>
      this.handleRequest(request),
    );
  }

  async prepareProjectFile(
    projectFilePath: string,
  ): Promise<PreparedAssetPreviewProject> {
    const absoluteProjectFilePath = path.resolve(projectFilePath);
    const projectRootPath = await realpath(
      path.dirname(absoluteProjectFilePath),
    );
    const contents = await readStableProjectFile(absoluteProjectFilePath);
    return parsePrivateManifest(
      contents,
      absoluteProjectFilePath,
      projectRootPath,
    );
  }

  async activateProjectFile(
    projectFilePath: string,
    result: EngineMutationResult,
    prepared?: PreparedAssetPreviewProject | null,
    rotateGeneration = false,
  ): Promise<boolean> {
    const absoluteProjectFilePath = path.resolve(projectFilePath);
    let candidate = prepared ?? null;

    if (
      candidate === null ||
      candidate.projectFilePath !== absoluteProjectFilePath
    ) {
      try {
        candidate = await this.prepareProjectFile(
          absoluteProjectFilePath,
        );
      } catch {
        candidate = null;
      }
    }

    if (candidate === null || !manifestMatchesResult(candidate, result)) {
      this.activeProject = null;
      return false;
    }

    const previous = this.activeProject;
    const canReuseGeneration =
      !rotateGeneration &&
      previous?.projectFilePath === candidate.projectFilePath &&
      previous.projectId === candidate.projectId;
    const generationToken = canReuseGeneration
      ? previous.generationToken
      : freshGenerationToken();
    const previewTokensByAssetId = new Map<string, string>();
    const assetIdsByPreviewToken = new Map<string, string>();

    if (canReuseGeneration) {
      for (const asset of candidate.assets.values()) {
        const previewToken = previous.previewTokensByAssetId.get(
          asset.id,
        );
        if (previewToken && asset.type === 'image') {
          previewTokensByAssetId.set(asset.id, previewToken);
          assetIdsByPreviewToken.set(previewToken, asset.id);
        }
      }
    }

    this.activeProject = {
      ...candidate,
      generationToken,
      previewTokensByAssetId,
      assetIdsByPreviewToken,
    };
    return true;
  }

  registerImportedImage(
    projectFilePath: string,
    sourceFilePath: string,
    result: EngineMutationResult,
  ): boolean {
    const assetId = result.assetId;
    const active = this.activeProject;
    const extension = canonicalImageExtension(sourceFilePath);
    const publicAsset = result.assets.find(
      (asset) => asset.id === assetId,
    );

    if (
      active === null ||
      path.resolve(projectFilePath) !== active.projectFilePath ||
      typeof assetId !== 'string' ||
      !isSafeImportedAssetId(assetId) ||
      extension === null ||
      publicAsset?.type !== 'image'
    ) {
      return false;
    }

    active.assets.set(assetId, {
      ...publicAsset,
      relativePath: `assets/images/${assetId}${extension}`,
    });
    return true;
  }

  getPreviewUrl(assetId: string): string | null {
    const active = this.activeProject;
    if (
      active === null ||
      !isOpaqueAssetId(assetId) ||
      active.assets.get(assetId)?.type !== 'image'
    ) {
      return null;
    }

    let previewToken = active.previewTokensByAssetId.get(assetId);
    if (!previewToken) {
      previewToken = freshGenerationToken();
      active.previewTokensByAssetId.set(assetId, previewToken);
      active.assetIdsByPreviewToken.set(previewToken, assetId);
    }

    return `${ASSET_PREVIEW_SCHEME}://image/${active.generationToken}/${previewToken}`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.activeProject = null;
    this.protocol.unhandle(ASSET_PREVIEW_SCHEME);
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (this.disposed) {
      return unavailableResponse();
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return unavailableResponse(405);
    }

    const active = this.activeProject;
    if (active === null) {
      return unavailableResponse();
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url);
    } catch {
      return unavailableResponse();
    }

    const pathMatch = requestUrl.pathname.match(
      /^\/([a-f0-9]{32})\/([a-f0-9]{32})$/,
    );
    if (
      requestUrl.protocol !== `${ASSET_PREVIEW_SCHEME}:` ||
      requestUrl.hostname !== 'image' ||
      requestUrl.username !== '' ||
      requestUrl.password !== '' ||
      requestUrl.port !== '' ||
      requestUrl.search !== '' ||
      requestUrl.hash !== '' ||
      pathMatch === null ||
      pathMatch[1] !== active.generationToken
    ) {
      return unavailableResponse();
    }

    const assetId = active.assetIdsByPreviewToken.get(pathMatch[2]);
    if (assetId === undefined) {
      return unavailableResponse();
    }

    const asset = active.assets.get(assetId);
    const mime = asset ? imageMimeForPath(asset.relativePath) : null;
    if (
      !isOpaqueAssetId(assetId) ||
      asset?.type !== 'image' ||
      mime === null
    ) {
      return unavailableResponse();
    }

    try {
      const safeAsset = await assertSafeAssetFile(
        active.projectRootPath,
        asset.relativePath,
      );
      const noFollow = constants.O_NOFOLLOW ?? 0;
      const file = await open(
        safeAsset.filePath,
        constants.O_RDONLY | noFollow,
      );

      try {
        const status = await file.stat();
        if (
          !sameFileSnapshot(safeAsset.snapshot, status) ||
          !status.isFile() ||
          status.nlink !== 1 ||
          status.size <= 0 ||
          status.size > MAX_PREVIEW_IMAGE_BYTES
        ) {
          await file.close();
          return unavailableResponse();
        }

        const header = Buffer.alloc(MAGIC_BYTE_COUNT);
        const { bytesRead } = await file.read(
          header,
          0,
          MAGIC_BYTE_COUNT,
          0,
        );
        if (!magicMatches(mime, header.subarray(0, bytesRead))) {
          await file.close();
          return unavailableResponse();
        }

        const afterOpen = await lstat(safeAsset.filePath);
        const afterOpenRealPath = await realpath(safeAsset.filePath);
        if (
          !sameFileSnapshot(status, afterOpen) ||
          afterOpenRealPath !== safeAsset.filePath ||
          this.activeProject !== active
        ) {
          await file.close();
          return unavailableResponse();
        }

        const headers = {
          'Cache-Control': 'no-store',
          'Content-Length': String(status.size),
          'Content-Type': mime,
          'X-Content-Type-Options': 'nosniff',
        };
        if (request.method === 'HEAD') {
          await file.close();
          return new Response(null, { status: 200, headers });
        }

        // Bound the response to the exact byte range that was validated.
        // If another process grows the same inode after stat(), the stream
        // must not read past the declared Content-Length or the 128 MiB cap.
        const stream = file.createReadStream({
          autoClose: true,
          start: 0,
          end: status.size - 1,
        });
        const body = Readable.toWeb(stream) as unknown as BodyInit;
        return new Response(body, {
          status: 200,
          headers,
        });
      } catch (error) {
        await file.close().catch(() => undefined);
        throw error;
      }
    } catch {
      return unavailableResponse();
    }
  }
}
