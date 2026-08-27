// 主要作用：建立项目根目录和固定清单文件的安全路径策略。
// 关键实现：校验规范路径，安全创建项目目录并只清理受控空目录。
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rmdir,
} from 'node:fs/promises';
import path from 'node:path';

import { PROJECT_FILE_NAME } from '../../shared/projectFileProtocol';

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
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

async function canonicalizeNewProjectRootPath(
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
