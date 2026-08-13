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
  PROJECT_FILE_SUFFIX,
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

function isCustomProjectFileName(fileName: string): boolean {
  return (
    fileName.length > PROJECT_FILE_SUFFIX.length &&
    fileName.toLowerCase().endsWith(PROJECT_FILE_SUFFIX)
  );
}

export function validateProjectFilePath(filePath: string): void {
  if (
    !path.isAbsolute(filePath) ||
    path.normalize(filePath) !== filePath ||
    !isCustomProjectFileName(path.basename(filePath))
  ) {
    throw new Error(
      `项目文件必须使用“名称${PROJECT_FILE_SUFFIX}”格式`,
    );
  }
}

export async function canonicalizeProjectFilePath(
  filePath: string,
): Promise<string> {
  const absolutePath = path.resolve(filePath);
  validateProjectFilePath(absolutePath);
  const directory = await realpath(path.dirname(absolutePath));
  const status = await lstat(directory);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('项目保存目录不是可安全使用的文件夹');
  }
  return path.join(directory, path.basename(absolutePath));
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
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const sourceFile = await open(
    sourcePath,
    constants.O_RDONLY | noFollow,
  );
  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${randomUUID()}.tmp`,
  );
  let temporaryFile: Awaited<ReturnType<typeof open>> | null = null;

  try {
    const sourceStatus = await sourceFile.stat();
    if (
      !sourceStatus.isFile() ||
      sourceStatus.nlink !== 1 ||
      sourceStatus.size > MAX_PROJECT_FILE_BYTES
    ) {
      throw new Error('后端项目文件不可安全发布');
    }

    temporaryFile = await open(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        noFollow,
      0o600,
    );
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
        throw new Error('后端项目文件在发布时发生了变化');
      }
      const { bytesWritten } = await temporaryFile.write(
        buffer,
        0,
        length,
        position,
      );
      if (bytesWritten !== length) {
        throw new Error('项目文件未能完整写入');
      }
      position += length;
    }

    if (!sameSnapshot(sourceStatus, await sourceFile.stat())) {
      throw new Error('后端项目文件在发布时发生了变化');
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
  } finally {
    await sourceFile.close();
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
    savedProjectFilePath: string | null,
  ): Promise<AssetImportLocation> {
    if (savedProjectFilePath === null) {
      const temporaryProjectFilePath =
        await this.ensureTemporaryProjectFilePath();
      return {
        backendProjectFilePath: temporaryProjectFilePath,
        previewProjectFilePath: temporaryProjectFilePath,
        isTemporary: true,
      };
    }

    const logicalPath = await canonicalizeProjectFilePath(
      savedProjectFilePath,
    );
    return {
      // asset.import validates this fixed basename but only uses its parent
      // directory; it never reads or writes this synthetic manifest path.
      backendProjectFilePath:
        path.basename(logicalPath) === PROJECT_FILE_NAME
          ? logicalPath
          : path.join(path.dirname(logicalPath), PROJECT_FILE_NAME),
      previewProjectFilePath: logicalPath,
      isTemporary: false,
    };
  }

  async backendSavePath(targetProjectFilePath: string): Promise<string> {
    const targetPath = await canonicalizeProjectFilePath(
      targetProjectFilePath,
    );
    this.assertTargetOutsideTemporaryWorkspace(targetPath);
    if (
      path.basename(targetPath) === PROJECT_FILE_NAME &&
      this.temporaryRootPath === null
    ) {
      return targetPath;
    }
    return this.ensureTemporaryProjectFilePath();
  }

  async publishSavedProject(
    backendProjectFilePath: string,
    targetProjectFilePath: string,
  ): Promise<void> {
    const backendPath = path.resolve(backendProjectFilePath);
    const targetPath = await canonicalizeProjectFilePath(
      targetProjectFilePath,
    );
    this.assertTargetOutsideTemporaryWorkspace(targetPath);
    if (backendPath === targetPath) {
      return;
    }

    const rollback: PublishRollback = {
      createdFiles: [],
      createdDirectories: [],
      touchedDirectories: new Set(),
    };
    try {
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
          path.join(path.dirname(targetPath), 'assets'),
          rollback,
          true,
        );
      }

      for (const directoryPath of [
        ...rollback.touchedDirectories,
      ].sort((left, right) => right.length - left.length)) {
        await syncDirectoryBeforeCommit(directoryPath);
      }

      // Manifest is the commit marker: publish it only after every referenced
      // binary is durable at the target. A failed manifest publish removes
      // only files created by this attempt and leaves the workspace intact.
      await atomicPublishManifest(backendPath, targetPath);
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
