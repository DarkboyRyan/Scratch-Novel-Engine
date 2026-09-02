#!/usr/bin/env node
/**
 * 主要作用：构建带哈希清单的 Web Player 模板目录。
 * 关键函数与实现：collectFiles、validatePayloadFiles、removeOwnedDirectory、main；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  opendir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { commandOptions } from './lib/releaseTools.mjs';

const TEMPLATE_FORMAT = 'vn-engine-web-player-template';
const TEMPLATE_VERSION = 1;
const RUNTIME_COMPATIBILITY = '>=1 <14';

function sameFile(left, right) {
  return left.isFile() &&
    right.isFile() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

async function stableFile(filePath) {
  const before = await lstat(filePath);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    throw new Error('Web Player 模板只能包含非链接普通文件');
  }
  const contents = await readFile(filePath);
  const after = await lstat(filePath);
  if (!sameFile(before, after) || contents.length !== after.size) {
    throw new Error('Web Player 模板文件在暂存时发生变化');
  }
  return contents;
}

async function collectFiles(root, directory = root) {
  const files = [];
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const entryPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, entryPath).split(path.sep).join('/');
    if (entry.isSymbolicLink()) {
      throw new Error('Web Player 模板不能包含符号链接');
    }
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, entryPath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error('Web Player 模板包含不支持的文件类型');
    }
  }
  return files;
}

function validatePayloadFiles(files) {
  if (!files.includes('index.html')) {
    throw new Error('Web Player 构建缺少 index.html');
  }
  if (!files.some((file) => /^player-assets\/player-[^/]+\.js$/u.test(file))) {
    throw new Error('Web Player 构建缺少主 JavaScript 资源');
  }
  for (const file of files) {
    if (file !== 'index.html' && !file.startsWith('player-assets/')) {
      throw new Error(`Web Player 构建包含未约定的根文件：${file}`);
    }
  }
}

function validateEntryHtml(contents) {
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    throw new Error('Web Player index.html 不是有效 UTF-8');
  }
  const htmlTags = [...source.matchAll(/<html\b[^<>]*>/giu)];
  if (htmlTags.length !== 1) {
    throw new Error('Web Player index.html 缺少唯一的 html 根标签');
  }
  const rawLanguageAttributes = [
    ...htmlTags[0][0].matchAll(/\s+lang\s*=/giu),
  ];
  const languageAttributes = [
    ...htmlTags[0][0].matchAll(/(\s+)lang\s*=\s*(["'])([^"']*)\2/giu),
  ];
  if (
    rawLanguageAttributes.length !== 1 ||
    languageAttributes.length !== 1 ||
    (languageAttributes[0][3] !== 'zh-CN' &&
      languageAttributes[0][3] !== 'en-US')
  ) {
    throw new Error('Web Player index.html 语言属性不符合模板契约');
  }
}

function safeOutput(output) {
  const resolved = path.resolve(output);
  const parsed = path.parse(resolved);
  if (
    resolved === parsed.root ||
    resolved === path.dirname(resolved) ||
    resolved.includes('\0') ||
    path.basename(resolved) !== 'web-player-template'
  ) {
    throw new Error('Web Player 模板输出目录不安全');
  }
  return resolved;
}

async function statusOrNull(entryPath) {
  try {
    return await lstat(entryPath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function sameDirectoryIdentity(left, right) {
  return left.isDirectory() &&
    right.isDirectory() &&
    !left.isSymbolicLink() &&
    !right.isSymbolicLink() &&
    left.dev === right.dev &&
    left.ino === right.ino;
}

async function removeOwnedDirectory(directoryPath, identity) {
  const current = await statusOrNull(directoryPath);
  if (current === null) {
    return;
  }
  if (!sameDirectoryIdentity(identity, current)) {
    throw new Error('Web Player 模板暂存目录身份发生变化，拒绝删除');
  }
  await rm(directoryPath, { recursive: true, force: false });
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
  const values = commandOptions({
    source: { type: 'string' },
    output: { type: 'string' },
  });
  const source = path.resolve(
    values.source ?? path.join(
      repositoryRoot,
      'apps',
      'player',
      '.vite',
      'web-player',
      'payload',
    ),
  );
  const requestedOutput = safeOutput(values.output ?? path.join(
    repositoryRoot,
    'engine',
    'stage',
    'web-player-template',
  ));
  const playerPackage = JSON.parse(await readFile(
    path.join(repositoryRoot, 'apps', 'player', 'package.json'),
    'utf8',
  ));
  if (
    typeof playerPackage.version !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(
      playerPackage.version,
    )
  ) {
    throw new Error('Player package version 无效');
  }

  const sourceStatus = await lstat(source);
  if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory()) {
    throw new Error('Web Player 构建目录必须是非链接普通目录');
  }
  const files = (await collectFiles(source)).sort();
  validatePayloadFiles(files);

  const requestedOutputParent = path.dirname(requestedOutput);
  await mkdir(requestedOutputParent, { recursive: true });
  const parentStatus = await lstat(requestedOutputParent);
  if (
    parentStatus.isSymbolicLink() ||
    !parentStatus.isDirectory()
  ) {
    throw new Error('Web Player 模板输出父目录必须是非链接目录');
  }
  const outputParent = await realpath(requestedOutputParent);
  const output = path.join(outputParent, path.basename(requestedOutput));
  const staging = path.join(
    outputParent,
    `.${path.basename(output)}.${randomUUID()}.staging`,
  );
  const backup = path.join(
    outputParent,
    `.${path.basename(output)}.${randomUUID()}.backup`,
  );
  let stagingIdentity = null;
  let backupIdentity = null;
  let published = false;
  try {
    const payload = path.join(staging, 'payload');
    await mkdir(payload, { recursive: true });
    stagingIdentity = await lstat(staging);
    const manifestFiles = [];
    for (const relativePath of files) {
      const contents = await stableFile(path.join(source, ...relativePath.split('/')));
      if (relativePath === 'index.html') {
        validateEntryHtml(contents);
      }
      const destination = path.join(payload, ...relativePath.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents, { flag: 'wx', mode: 0o600 });
      manifestFiles.push({
        path: relativePath,
        bytes: contents.length,
        sha256: createHash('sha256').update(contents).digest('hex'),
      });
    }
    const manifest = {
      format: TEMPLATE_FORMAT,
      templateVersion: TEMPLATE_VERSION,
      payloadRoot: 'payload',
      entry: 'index.html',
      runtimeCompatibility: RUNTIME_COMPATIBILITY,
      playerVersion: playerPackage.version,
      files: manifestFiles,
    };
    await writeFile(
      path.join(staging, 'web-player-template.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    const existing = await statusOrNull(output);
    if (existing !== null) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) {
        throw new Error('已有 Web Player 模板不是安全目录');
      }
      await rename(output, backup);
      backupIdentity = existing;
    }
    const currentStaging = await lstat(staging);
    if (!sameDirectoryIdentity(stagingIdentity, currentStaging)) {
      throw new Error('Web Player 模板暂存目录身份发生变化，拒绝发布');
    }
    await rename(staging, output);
    published = true;
    if (backupIdentity !== null) {
      await removeOwnedDirectory(backup, backupIdentity);
      backupIdentity = null;
    }
  } catch (error) {
    if (!published && backupIdentity !== null) {
      const currentOutput = await statusOrNull(output);
      const currentBackup = await statusOrNull(backup);
      if (
        currentOutput === null &&
        currentBackup !== null &&
        sameDirectoryIdentity(backupIdentity, currentBackup)
      ) {
        await rename(backup, output);
        backupIdentity = null;
      }
    }
    if (stagingIdentity !== null) {
      await removeOwnedDirectory(staging, stagingIdentity);
    }
    throw error;
  }
  process.stdout.write(`Web Player 模板已生成：${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
