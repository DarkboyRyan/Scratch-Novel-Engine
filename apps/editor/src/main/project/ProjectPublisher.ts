// 主要作用：把后端保存快照安全发布为项目目录中的正式清单。
// 关键实现：publishProjectSnapshot 验证快照并使用临时文件和原子替换提交。
import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

import { projectManifestPath } from './ProjectPathPolicy';

const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;
const COPY_BUFFER_BYTES = 64 * 1024;
const ASSET_DIRECTORIES = new Set(['audio', 'images', 'videos']);

type PublishRollback = {
  createdFiles: string[];
  createdDirectories: string[];
  touchedDirectories: Set<string>;
};

export type ValidateProjectSnapshot = (
  manifestContents: string,
  targetProjectRootPath: string,
) => Promise<void>;

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

async function readStableManifestBytes(filePath: string): Promise<Buffer> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const manifest = await open(
    filePath,
    constants.O_RDONLY | noFollow,
  );
  try {
    const before = await manifest.stat();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > MAX_PROJECT_FILE_BYTES
    ) {
      throw new Error('后端项目文件不可安全校验');
    }
    const manifestBytes = await manifest.readFile();
    if (!sameSnapshot(before, await manifest.stat())) {
      throw new Error('后端项目文件在校验时发生了变化');
    }
    return manifestBytes;
  } finally {
    await manifest.close();
  }
}

// targetProjectRootPath is canonicalized and checked against the owning
// session's private workspace before this transaction starts.
export async function publishProjectSnapshot(
  backendProjectFilePath: string,
  targetProjectRootPath: string,
  validateBeforeCommit?: ValidateProjectSnapshot,
): Promise<string> {
  const backendPath = path.resolve(backendProjectFilePath);
  const targetPath = projectManifestPath(targetProjectRootPath);
  if (backendPath === targetPath) {
    return (await readStableManifestBytes(backendPath)).toString('utf8');
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
    const targetAssets = path.join(targetProjectRootPath, 'assets');
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
    const manifestBytes = await readStableManifestBytes(backendPath);
    if (validateBeforeCommit) {
      await validateBeforeCommit(
        manifestBytes.toString('utf8'),
        targetProjectRootPath,
      );
    }

    // Manifest is the commit marker: publish it only after every referenced
    // binary is durable at the target. A failed manifest publish removes
    // only files created by this attempt and leaves the workspace intact.
    await atomicPublishManifest(manifestBytes, targetPath);
    return manifestBytes.toString('utf8');
  } catch (error) {
    await rollbackPublishedAssets(rollback);
    throw error;
  }
}
