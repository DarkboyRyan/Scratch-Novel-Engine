import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  lstat,
  open,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { Protocol } from 'electron';

import type { EngineMutationResult } from '../../shared/engineProtocol';
import type { AssetDocument } from '../../shared/projectTypes';
import { mediaMagicMatches } from '../media/MediaContentValidator';
import {
  canonicalAssetExtension,
  maximumPreviewBytes,
  previewMimeForAsset,
} from '../media/MediaFormat';
import { parseSingleByteRange } from '../media/MediaRange';

export const ASSET_PREVIEW_SCHEME = 'vn-asset';

const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;

type PrivateAssetRecord = AssetDocument & {
  relativePath: string;
};

export type PreparedAssetPreviewProject = {
  projectFilePath: string;
  projectRootPath: string;
  projectId: string;
  assets: Map<string, PrivateAssetRecord>;
  // Main passes these exact, already-stabilized bytes to C++. This prevents
  // the preview manifest and authoritative Project from coming from two
  // different reads of a file that changed between operations.
  manifestContents: string;
};

type ActiveAssetPreviewProject = PreparedAssetPreviewProject & {
  generationToken: string;
  previewTokensByAssetId: Map<string, string>;
  assetIdsByPreviewToken: Map<string, string>;
};

type ProtocolRegistrar = Pick<Protocol, 'handle' | 'unhandle'>;

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
    manifestContents: contents,
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
    left.mode === right.mode &&
    left.nlink === right.nlink
  );
}

async function readStableProjectFile(filePath: string): Promise<string> {
  const before = await lstat(filePath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size > MAX_PROJECT_FILE_BYTES
  ) {
    throw new Error('项目文件不是可安全读取的常规文件');
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(filePath, constants.O_RDONLY | noFollow);
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.nlink !== 1 ||
        !sameFileSnapshot(before, opened)) {
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

async function validatePreparedAssetFile(
  projectRootPath: string,
  asset: PrivateAssetRecord,
): Promise<void> {
  const safeAsset = await assertSafeAssetFile(
    projectRootPath,
    asset.relativePath,
  );
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(safeAsset.filePath, constants.O_RDONLY | noFollow);
  try {
    const status = await file.stat();
    const maximumBytes = maximumPreviewBytes(asset.type);
    if (
      !sameFileSnapshot(safeAsset.snapshot, status) ||
      !status.isFile() || status.nlink !== 1 ||
      status.size <= 0 || status.size > maximumBytes
    ) {
      throw new Error('项目资源不是有效的常规文件');
    }
    const mime = previewMimeForAsset(asset.type, asset.relativePath);
    const valid = mime !== null && await mediaMagicMatches(
      file,
      mime,
      status.size,
    );
    if (!valid || !sameFileSnapshot(status, await file.stat())) {
      throw new Error('项目资源类型与文件内容不一致');
    }
  } finally {
    await file.close();
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

function rangeNotSatisfiableResponse(fileSize: number): Response {
  return new Response(null, {
    status: 416,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Range': `bytes */${fileSize}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function previewHostnameForAsset(
  asset: PrivateAssetRecord,
): AssetDocument['type'] {
  return asset.type;
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
    const prepared = parsePrivateManifest(
      contents,
      absoluteProjectFilePath,
      projectRootPath,
    );
    // Validate sequentially so a large manifest cannot exhaust the process's
    // file descriptor limit by opening every Asset at once.
    for (const asset of prepared.assets.values()) {
      await validatePreparedAssetFile(projectRootPath, asset);
    }
    return prepared;
  }

  async validateProjectSnapshotAtRoot(
    manifestContents: string,
    projectRootPath: string,
  ): Promise<void> {
    const canonicalRootPath = await realpath(projectRootPath);
    const prepared = parsePrivateManifest(
      manifestContents,
      path.join(canonicalRootPath, 'project.vn.json'),
      canonicalRootPath,
    );
    for (const asset of prepared.assets.values()) {
      await validatePreparedAssetFile(canonicalRootPath, asset);
    }
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
        if (
          previewToken &&
          (asset.type === 'image' ||
            asset.type === 'audio' ||
            asset.type === 'video')
        ) {
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

  async activateTemporaryProject(
    projectFilePath: string,
    result: EngineMutationResult,
  ): Promise<boolean> {
    const absoluteProjectFilePath = path.resolve(projectFilePath);
    const active = this.activeProject;
    if (
      active?.projectFilePath === absoluteProjectFilePath &&
      active.projectId === result.project.id
    ) {
      const matches = result.assets.length === active.assets.size &&
        result.assets.every((asset) => {
        const privateAsset = active.assets.get(asset.id);
        return (
          privateAsset?.type === asset.type &&
          privateAsset.displayName === asset.displayName
        );
      });
      if (!matches) {
        // A stale private map must not keep old capability URLs alive after
        // the authoritative C++ Asset set has changed.
        this.activeProject = null;
      }
      return matches;
    }

    // An unsaved project can only acquire Assets through this window's import
    // flow. If public Assets already exist but Main has no matching private
    // map, fail closed rather than inventing a disk path.
    if (result.assets.length !== 0) {
      return false;
    }

    const projectRootPath = await realpath(
      path.dirname(absoluteProjectFilePath),
    );
    this.activeProject = {
      projectFilePath: absoluteProjectFilePath,
      projectRootPath,
      projectId: result.project.id,
      assets: new Map(),
      manifestContents: '',
      generationToken: freshGenerationToken(),
      previewTokensByAssetId: new Map(),
      assetIdsByPreviewToken: new Map(),
    };
    return true;
  }

  registerImportedAsset(
    projectFilePath: string,
    sourceFilePath: string,
    result: EngineMutationResult,
  ): boolean {
    const assetId = result.assetId;
    const active = this.activeProject;
    const publicAsset = result.assets.find(
      (asset) => asset.id === assetId,
    );
    const extension = publicAsset
      ? canonicalAssetExtension(publicAsset.type, sourceFilePath)
      : null;

    if (
      active === null ||
      path.resolve(projectFilePath) !== active.projectFilePath ||
      typeof assetId !== 'string' ||
      !isSafeImportedAssetId(assetId) ||
      extension === null ||
      publicAsset === undefined
    ) {
      return false;
    }

    active.assets.set(assetId, {
      ...publicAsset,
      relativePath: `assets/${expectedAssetDirectory(
        publicAsset.type,
      )}/${assetId}${extension}`,
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

    return this.issueMediaUrl(active, assetId, 'image');
  }

  getMediaUrl(assetId: string): string | null {
    const active = this.activeProject;
    if (active === null || !isOpaqueAssetId(assetId)) {
      return null;
    }
    const asset = active.assets.get(assetId);
    const hostname = asset ? previewHostnameForAsset(asset) : null;
    if (hostname === null) {
      return null;
    }
    return this.issueMediaUrl(active, assetId, hostname);
  }

  private issueMediaUrl(
    active: ActiveAssetPreviewProject,
    assetId: string,
    hostname: AssetDocument['type'],
  ): string {
    let previewToken = active.previewTokensByAssetId.get(assetId);
    if (!previewToken) {
      previewToken = freshGenerationToken();
      active.previewTokensByAssetId.set(assetId, previewToken);
      active.assetIdsByPreviewToken.set(previewToken, assetId);
    }

    return `${ASSET_PREVIEW_SCHEME}://${hostname}/${active.generationToken}/${previewToken}`;
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
      (requestUrl.hostname !== 'image' &&
        requestUrl.hostname !== 'audio' &&
        requestUrl.hostname !== 'video') ||
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
    const mime = asset
      ? previewMimeForAsset(asset.type, asset.relativePath)
      : null;
    const expectedHostname = asset
      ? previewHostnameForAsset(asset)
      : null;
    if (
      !isOpaqueAssetId(assetId) ||
      asset === undefined ||
      expectedHostname === null ||
      requestUrl.hostname !== expectedHostname ||
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
          status.size > maximumPreviewBytes(asset.type)
        ) {
          await file.close();
          return unavailableResponse();
        }

        if (!(await mediaMagicMatches(file, mime, status.size))) {
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

        const supportsRanges =
          asset.type === 'audio' || asset.type === 'video';
        const rangeHeader = supportsRanges
          ? request.headers.get('Range')
          : null;
        const range = rangeHeader === null
          ? null
          : parseSingleByteRange(rangeHeader, status.size);
        if (rangeHeader !== null && range === null) {
          await file.close();
          return rangeNotSatisfiableResponse(status.size);
        }
        const responseStart = range?.start ?? 0;
        const responseEnd = range?.end ?? status.size - 1;
        const contentLength = responseEnd - responseStart + 1;
        const headers: Record<string, string> = {
          'Cache-Control': 'no-store',
          'Content-Length': String(contentLength),
          'Content-Type': mime,
          'X-Content-Type-Options': 'nosniff',
        };
        if (supportsRanges) {
          headers['Accept-Ranges'] = 'bytes';
        }
        if (range !== null) {
          headers['Content-Range'] =
            `bytes ${responseStart}-${responseEnd}/${status.size}`;
        }
        const responseStatus = range === null ? 200 : 206;
        if (request.method === 'HEAD') {
          await file.close();
          return new Response(null, { status: responseStatus, headers });
        }

        // Bound the response to the exact byte range that was validated.
        // If another process grows the same inode after stat(), the stream
        // must not read past the declared Content-Length or media size cap.
        const stream = file.createReadStream({
          autoClose: true,
          start: responseStart,
          end: responseEnd,
        });
        const body = Readable.toWeb(stream) as unknown as BodyInit;
        return new Response(body, {
          status: responseStatus,
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
