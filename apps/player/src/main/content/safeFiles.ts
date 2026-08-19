import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  lstat,
  open,
  realpath,
  type FileHandle,
} from 'node:fs/promises';
import path from 'node:path';

export type StableFileSnapshot = Stats;

export type OpenedSafeFile = {
  file: FileHandle;
  filePath: string;
  snapshot: StableFileSnapshot;
};

export function sameFileSnapshot(left: Stats, right: Stats): boolean {
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

function isContainedPath(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function canonicalizeBundleRoot(
  bundleRoot: string,
): Promise<string> {
  const absoluteRoot = path.resolve(bundleRoot);
  const status = await lstat(absoluteRoot);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('游戏内容包根目录无效');
  }
  return realpath(absoluteRoot);
}

export async function openSafeBundleFile(
  canonicalRoot: string,
  relativePath: string,
  expectedSnapshot?: StableFileSnapshot,
): Promise<OpenedSafeFile> {
  const components = relativePath.split('/');
  let currentPath = canonicalRoot;

  for (const [index, component] of components.entries()) {
    if (
      component.length === 0 ||
      component === '.' ||
      component === '..' ||
      component.includes('\\') ||
      component.includes('\0')
    ) {
      throw new Error('游戏内容包包含不安全路径');
    }

    currentPath = path.join(currentPath, component);
    const status = await lstat(currentPath);
    const finalComponent = index === components.length - 1;
    if (
      status.isSymbolicLink() ||
      (finalComponent ? !status.isFile() : !status.isDirectory())
    ) {
      throw new Error('游戏内容包路径不能包含符号链接');
    }
  }

  const resolvedPath = await realpath(currentPath);
  if (!isContainedPath(canonicalRoot, resolvedPath)) {
    throw new Error('游戏内容包路径逃逸了内容根目录');
  }

  const beforeOpen = await lstat(resolvedPath);
  if (
    beforeOpen.isSymbolicLink() ||
    !beforeOpen.isFile() ||
    beforeOpen.nlink !== 1 ||
    (expectedSnapshot !== undefined &&
      !sameFileSnapshot(beforeOpen, expectedSnapshot))
  ) {
    throw new Error('游戏资源在验证后发生了变化');
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(resolvedPath, constants.O_RDONLY | noFollow);
  try {
    const opened = await file.stat();
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      !sameFileSnapshot(beforeOpen, opened) ||
      (expectedSnapshot !== undefined &&
        !sameFileSnapshot(opened, expectedSnapshot))
    ) {
      throw new Error('游戏资源在打开前发生了变化');
    }
    return { file, filePath: resolvedPath, snapshot: opened };
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
}

export async function readStableUtf8File(
  canonicalRoot: string,
  relativePath: string,
  maximumBytes: number,
): Promise<string> {
  const opened = await openSafeBundleFile(canonicalRoot, relativePath);
  try {
    if (opened.snapshot.size <= 0 || opened.snapshot.size > maximumBytes) {
      throw new Error('游戏内容文件大小无效');
    }
    const contents = await opened.file.readFile({ encoding: 'utf8' });
    const afterRead = await opened.file.stat();
    if (!sameFileSnapshot(opened.snapshot, afterRead)) {
      throw new Error('游戏内容文件在读取时发生了变化');
    }
    return contents;
  } finally {
    await opened.file.close();
  }
}

export async function sha256File(
  file: FileHandle,
  fileSize: number,
): Promise<string> {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(256 * 1024);
  let position = 0;
  while (position < fileSize) {
    const length = Math.min(buffer.length, fileSize - position);
    const { bytesRead } = await file.read(buffer, 0, length, position);
    if (bytesRead <= 0) {
      throw new Error('游戏资源读取不完整');
    }
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest('hex');
}
