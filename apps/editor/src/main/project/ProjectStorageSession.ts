import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  PROJECT_FILE_NAME,
} from '../../shared/projectFileProtocol';

const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;
const COPY_BUFFER_BYTES = 64 * 1024;
const ASSET_DIRECTORIES = new Set(['audio', 'images', 'videos']);

type AssetImportLocation = {
  backendProjectFilePath: string;
  previewProjectFilePath: string;
  isTemporary: boolean;
};

type PublishRollback = {
  createdFiles: string[];
  createdDirectories: string[];
  touchedDirectories: Set<string>;
};

type RemoveTemporaryWorkspace = (
  temporaryRootPath: string,
) => Promise<void>;

async function removeTemporaryWorkspace(
  temporaryRootPath: string,
): Promise<void> {
  await rm(temporaryRootPath, { recursive: true, force: true });
}

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function sameSnapshot(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

export function validateProjectRootPath(projectRootPath: string): void {
  if (
    !path.isAbsolute(projectRootPath) ||
    path.normalize(projectRootPath) !== projectRootPath ||
    path.basename(projectRootPath).trim().length === 0
  ) {
    throw new Error('项目必须保存到一个有效的绝对文件夹路径');
  }
}

export async function canonicalizeProjectRootPath(
  projectRootPath: string,
): Promise<string> {
  const absolutePath = path.resolve(projectRootPath);
  validateProjectRootPath(absolutePath);
  const selectedStatus = await lstat(absolutePath);
  if (selectedStatus.isSymbolicLink() || !selectedStatus.isDirectory()) {
    throw new Error('所选项目路径不是可安全使用的文件夹');
  }
  return realpath(absolutePath);
}

export function projectManifestPath(projectRootPath: string): string {
  return path.join(projectRootPath, PROJECT_FILE_NAME);
}

export async function resolveProjectManifestPath(
  projectRootPath: string,
): Promise<{ projectRootPath: string; projectFilePath: string }> {
  const canonicalRootPath = await canonicalizeProjectRootPath(
    projectRootPath,
  );
  const projectFilePath = projectManifestPath(canonicalRootPath);
  const status = await lstat(projectFilePath);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.nlink !== 1
  ) {
    throw new Error(`项目文件夹中缺少安全的 ${PROJECT_FILE_NAME}`);
  }
  return { projectRootPath: canonicalRootPath, projectFilePath };
}

export async function canonicalizeNewProjectRootPath(
  projectRootPath: string,
): Promise<string> {
  const canonicalRootPath = await canonicalizeProjectRootPath(
    projectRootPath,
  );
  if ((await readdir(canonicalRootPath)).length !== 0) {
    throw new Error('首次保存请选择或创建一个空文件夹');
  }
  return canonicalRootPath;
}

function safeProjectFolderName(projectName: string): string {
  const withoutControlCharacters = [...projectName]
    .map((character) =>
      character.charCodeAt(0) < 32 ? '-' : character,
    )
    .join('');
  const normalized = withoutControlCharacters
    .normalize('NFC')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 100)
    .trim();
  return normalized.length === 0 ? '未命名项目' : normalized;
}

export async function createProjectRootInParent(
  parentDirectoryPath: string,
  projectName: string,
): Promise<string> {
  const parentPath = await canonicalizeProjectRootPath(
    parentDirectoryPath,
  );
  const projectRootPath = path.join(
    parentPath,
    safeProjectFolderName(projectName),
  );
  try {
    await mkdir(projectRootPath, { mode: 0o700 });
  } catch (error) {
    if (errnoCode(error) === 'EEXIST') {
      throw new Error('保存位置已经存在同名文件夹，请修改项目名或选择其他位置');
    }
    throw error;
  }
  try {
    return await canonicalizeNewProjectRootPath(projectRootPath);
  } catch (error) {
    // Only remove the directory we just created, and only when it is still
    // empty. If another process added anything, rmdir fails closed.
    await rmdir(projectRootPath).catch(() => undefined);
    throw error;
  }
}

export async function removeProjectRootIfEmpty(
  projectRootPath: string,
): Promise<void> {
  const canonicalRootPath = await canonicalizeProjectRootPath(
    projectRootPath,
  );
  if ((await readdir(canonicalRootPath)).length === 0) {
    await rmdir(canonicalRootPath);
  }
}

async function ensureSafeDirectory(
  directoryPath: string,
  rollback: PublishRollback,
): Promise<void> {
  rollback.touchedDirectories.add(directoryPath);
  try {
    await mkdir(directoryPath, { mode: 0o700 });
    rollback.createdDirectories.push(directoryPath);
    return;
  } catch (error) {
    if (errnoCode(error) !== 'EEXIST') {
      throw error;
    }
  }

  const status = await lstat(directoryPath);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('目标资源路径包含非目录或符号链接');
  }
}

async function syncDirectoryBeforeCommit(
  directoryPath: string,
): Promise<void> {
  // Windows does not support opening directories through fs.open. Its rename
  // implementation supplies the platform's write-through behavior instead.
  if (process.platform === 'win32') {
    return;
  }
  const directory = await open(directoryPath, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function filesHaveSameContents(
  sourceFile: Awaited<ReturnType<typeof open>>,
  sourceStatus: Stats,
  destinationPath: string,
): Promise<boolean> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let destinationFile;
  try {
    destinationFile = await open(
      destinationPath,
      constants.O_RDONLY | noFollow,
    );
  } catch {
    return false;
  }

  try {
    const destinationStatus = await destinationFile.stat();
    if (
      !destinationStatus.isFile() ||
      destinationStatus.nlink !== 1 ||
      destinationStatus.size !== sourceStatus.size
    ) {
      return false;
    }

    const sourceBuffer = Buffer.alloc(COPY_BUFFER_BYTES);
    const destinationBuffer = Buffer.alloc(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < sourceStatus.size) {
      const length = Math.min(
        COPY_BUFFER_BYTES,
        sourceStatus.size - position,
      );
      const [sourceRead, destinationRead] = await Promise.all([
        sourceFile.read(sourceBuffer, 0, length, position),
        destinationFile.read(
          destinationBuffer,
          0,
          length,
          position,
        ),
      ]);
      if (
        sourceRead.bytesRead !== length ||
        destinationRead.bytesRead !== length ||
        !sourceBuffer.subarray(0, length).equals(
          destinationBuffer.subarray(0, length),
        )
      ) {
        return false;
      }
      position += length;
    }

    return sameSnapshot(destinationStatus, await destinationFile.stat());
  } finally {
    await destinationFile.close();
  }
}

async function copyAssetFileNoClobber(
  sourcePath: string,
  destinationPath: string,
  rollback: PublishRollback,
): Promise<void> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const sourceFile = await open(
    sourcePath,
    constants.O_RDONLY | noFollow,
  );
  let destinationFile: Awaited<ReturnType<typeof open>> | null = null;
  let createdDestination = false;

  try {
    const sourceStatus = await sourceFile.stat();
    if (
      !sourceStatus.isFile() ||
      sourceStatus.nlink !== 1 ||
      sourceStatus.size < 0
    ) {
      throw new Error('临时项目包含不可安全迁移的资源文件');
    }

    try {
      destinationFile = await open(
        destinationPath,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          noFollow,
        0o600,
      );
      createdDestination = true;
    } catch (error) {
      if (
        errnoCode(error) === 'EEXIST' &&
        (await filesHaveSameContents(
          sourceFile,
          sourceStatus,
          destinationPath,
        ))
      ) {
        return;
      }
      throw new Error('目标项目已有同名但内容不同的资源文件');
    }

    const buffer = Buffer.alloc(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < sourceStatus.size) {
      const length = Math.min(
        COPY_BUFFER_BYTES,
        sourceStatus.size - position,
      );
      const { bytesRead } = await sourceFile.read(
        buffer,
        0,
        length,
        position,
      );
      if (bytesRead !== length) {
        throw new Error('临时资源文件在迁移时发生了变化');
      }
      const { bytesWritten } = await destinationFile.write(
        buffer,
        0,
        length,
        position,
      );
      if (bytesWritten !== length) {
        throw new Error('目标资源文件未能完整写入');
      }
      position += length;
    }

    if (!sameSnapshot(sourceStatus, await sourceFile.stat())) {
      throw new Error('临时资源文件在迁移时发生了变化');
    }
    await destinationFile.sync();
    await destinationFile.close();
    destinationFile = null;
    rollback.createdFiles.push(destinationPath);
  } catch (error) {
    await destinationFile?.close().catch(() => undefined);
    if (createdDestination) {
      await unlink(destinationPath).catch(() => undefined);
    }
    throw error;
  } finally {
    await sourceFile.close();
  }
}

async function copyAssetDirectory(
  sourceDirectory: string,
  destinationDirectory: string,
  rollback: PublishRollback,
  isAssetRoot = false,
): Promise<void> {
  const sourceStatus = await lstat(sourceDirectory);
  if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory()) {
    throw new Error('临时项目资源目录不安全');
  }

  await ensureSafeDirectory(destinationDirectory, rollback);
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (isAssetRoot && !ASSET_DIRECTORIES.has(entry.name)) {
      throw new Error('临时项目包含未知的资源目录');
    }

    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);
    const status = await lstat(sourcePath);
    if (status.isSymbolicLink()) {
      throw new Error('临时项目资源路径不能包含符号链接');
    }
    if (status.isDirectory()) {
      await copyAssetDirectory(
        sourcePath,
        destinationPath,
        rollback,
      );
    } else if (status.isFile()) {
      await copyAssetFileNoClobber(
        sourcePath,
        destinationPath,
        rollback,
      );
    } else {
      throw new Error('临时项目包含非常规资源文件');
    }
  }
}

async function rollbackPublishedAssets(
  rollback: PublishRollback,
): Promise<void> {
  for (const filePath of [...rollback.createdFiles].reverse()) {
    await unlink(filePath).catch(() => undefined);
  }
  for (const directoryPath of [
    ...rollback.createdDirectories,
  ].reverse()) {
    await rmdir(directoryPath).catch(() => undefined);
  }
}

async function atomicPublishManifest(
  contents: Buffer,
  destinationPath: string,
): Promise<void> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  if (contents.byteLength > MAX_PROJECT_FILE_BYTES) {
    throw new Error('后端项目文件超过大小上限');
  }
  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${randomUUID()}.tmp`,
  );
  let temporaryFile: Awaited<ReturnType<typeof open>> | null = null;

  try {
    temporaryFile = await open(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        noFollow,
      0o600,
    );
    let position = 0;
    while (position < contents.byteLength) {
      const length = Math.min(
        COPY_BUFFER_BYTES,
        contents.byteLength - position,
      );
      const { bytesWritten } = await temporaryFile.write(
        contents,
        position,
        length,
        position,
      );
      if (bytesWritten !== length) {
        throw new Error('项目文件未能完整写入');
      }
      position += length;
    }
    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = null;

    try {
      const destinationStatus = await lstat(destinationPath);
      if (
        destinationStatus.isSymbolicLink() ||
        !destinationStatus.isFile() ||
        destinationStatus.nlink !== 1
      ) {
        throw new Error('目标项目文件不是可安全替换的常规文件');
      }
    } catch (error) {
      if (errnoCode(error) !== 'ENOENT') {
        throw error;
      }
    }
    await rename(temporaryPath, destinationPath);
    // The manifest is already committed. Directory sync is best effort here
    // so a platform-specific fsync limitation cannot turn a successful atomic
    // replacement into a reported failure.
    await syncDirectoryBeforeCommit(path.dirname(destinationPath)).catch(
      () => undefined,
    );
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export class ProjectStorageSession {
  private temporaryRootPath: string | null = null;

  constructor(
    private readonly removeWorkspace: RemoveTemporaryWorkspace =
      removeTemporaryWorkspace,
  ) {}

  private assertTargetOutsideTemporaryWorkspace(targetPath: string): void {
    if (this.temporaryRootPath === null) {
      return;
    }

    const relative = path.relative(this.temporaryRootPath, targetPath);
    const isInsideOrEqual =
      relative === '' ||
      (relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative));
    if (isInsideOrEqual) {
      throw new Error('项目不能保存到编辑器的临时工作区');
    }
  }

  async assetImportLocation(
    savedProjectRootPath: string | null,
  ): Promise<AssetImportLocation> {
    if (savedProjectRootPath === null) {
      const temporaryProjectFilePath =
        await this.ensureTemporaryProjectFilePath();
      return {
        backendProjectFilePath: temporaryProjectFilePath,
        previewProjectFilePath: temporaryProjectFilePath,
        isTemporary: true,
      };
    }

    const logicalRootPath = await canonicalizeProjectRootPath(
      savedProjectRootPath,
    );
    const logicalPath = projectManifestPath(logicalRootPath);
    return {
      backendProjectFilePath: logicalPath,
      previewProjectFilePath: logicalPath,
      isTemporary: false,
    };
  }

  async backendSavePath(targetProjectRootPath: string): Promise<string> {
    const targetRootPath = await canonicalizeProjectRootPath(
      targetProjectRootPath,
    );
    this.assertTargetOutsideTemporaryWorkspace(targetRootPath);
    // C++ always writes to a Main-private manifest. Even later saves to an
    // existing project must cross atomicPublishManifest rather than writing
    // directly over the user's only committed manifest.
    return this.ensureTemporaryProjectFilePath();
  }

  async publishSavedProject(
    backendProjectFilePath: string,
    targetProjectRootPath: string,
    validateBeforeCommit?: (
      manifestContents: string,
      targetProjectRootPath: string,
    ) => Promise<void>,
  ): Promise<void> {
    const backendPath = path.resolve(backendProjectFilePath);
    const targetRootPath = await canonicalizeProjectRootPath(
      targetProjectRootPath,
    );
    this.assertTargetOutsideTemporaryWorkspace(targetRootPath);
    const targetPath = projectManifestPath(targetRootPath);
    if (backendPath === targetPath) {
      return;
    }

    const rollback: PublishRollback = {
      createdFiles: [],
      createdDirectories: [],
      touchedDirectories: new Set(),
    };
    try {
      // Every committed project has the same predictable media structure,
      // even before its first import. These directories participate in the
      // same rollback as copied assets when manifest publication fails.
      const targetAssets = path.join(targetRootPath, 'assets');
      await ensureSafeDirectory(targetAssets, rollback);
      for (const directoryName of [...ASSET_DIRECTORIES].sort()) {
        await ensureSafeDirectory(
          path.join(targetAssets, directoryName),
          rollback,
        );
      }

      const sourceAssets = path.join(path.dirname(backendPath), 'assets');
      let sourceAssetsExist = true;
      try {
        await lstat(sourceAssets);
      } catch (error) {
        if (errnoCode(error) === 'ENOENT') {
          sourceAssetsExist = false;
        } else {
          throw error;
        }
      }
      if (sourceAssetsExist) {
        await copyAssetDirectory(
          sourceAssets,
          targetAssets,
          rollback,
          true,
        );
      }

      for (const directoryPath of [
        ...rollback.touchedDirectories,
      ].sort((left, right) => right.length - left.length)) {
        await syncDirectoryBeforeCommit(directoryPath);
      }

      // Validate the exact manifest snapshot against the final target root
      // before replacing the old commit marker. This catches an Asset that
      // was deleted or swapped after import but before Save.
      const noFollow = constants.O_NOFOLLOW ?? 0;
      const backendManifest = await open(
        backendPath,
        constants.O_RDONLY | noFollow,
      );
      let manifestBytes: Buffer;
      try {
        const before = await backendManifest.stat();
        if (
          !before.isFile() ||
          before.nlink !== 1 ||
          before.size > MAX_PROJECT_FILE_BYTES
        ) {
          throw new Error('后端项目文件不可安全校验');
        }
        manifestBytes = await backendManifest.readFile();
        if (!sameSnapshot(before, await backendManifest.stat())) {
          throw new Error('后端项目文件在校验时发生了变化');
        }
      } finally {
        await backendManifest.close();
      }
      if (validateBeforeCommit) {
        await validateBeforeCommit(
          manifestBytes.toString('utf8'),
          targetRootPath,
        );
      }

      // Manifest is the commit marker: publish it only after every referenced
      // binary is durable at the target. A failed manifest publish removes
      // only files created by this attempt and leaves the workspace intact.
      await atomicPublishManifest(manifestBytes, targetPath);
    } catch (error) {
      await rollbackPublishedAssets(rollback);
      throw error;
    }
  }

  async completeSuccessfulSave(
    backendProjectFilePath: string,
  ): Promise<void> {
    if (
      this.temporaryRootPath !== null &&
      path.dirname(path.resolve(backendProjectFilePath)) ===
        this.temporaryRootPath
    ) {
      await this.discardTemporaryWorkspace();
    }
  }

  async discardTemporaryWorkspace(): Promise<void> {
    const temporaryRootPath = this.temporaryRootPath;
    if (temporaryRootPath !== null) {
      // Detach first. Even if best-effort cleanup fails, a later project must
      // never reuse a workspace that may contain stale manifests or Assets.
      this.temporaryRootPath = null;
      await this.removeWorkspace(temporaryRootPath);
    }
  }

  async dispose(): Promise<void> {
    await this.discardTemporaryWorkspace();
  }

  private async ensureTemporaryProjectFilePath(): Promise<string> {
    if (this.temporaryRootPath === null) {
      const temporaryBase = await realpath(tmpdir());
      this.temporaryRootPath = await mkdtemp(
        path.join(temporaryBase, 'vn-engine-project-'),
      );
    }
    return path.join(this.temporaryRootPath, PROJECT_FILE_NAME);
  }
}
