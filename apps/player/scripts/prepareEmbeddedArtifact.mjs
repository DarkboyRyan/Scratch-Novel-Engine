#!/usr/bin/env node
/**
 * 主要作用：从导出制品中发现并准备单游戏嵌入包。
 * 关键函数与实现：`discoverBundles`、`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  copyVerifiedDirectory,
  requiredOption,
  verifyRuntimeBundle,
} from './lib/releaseTools.mjs';

async function discoverBundles(root, relative = '') {
  const directory = relative === '' ? root : path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const bundles = [];
  for (const entry of entries) {
    const childRelative = relative === '' ? entry.name : path.join(relative, entry.name);
    const childPath = path.join(root, childRelative);
    const status = await lstat(childPath);
    if (status.isSymbolicLink()) {
      throw new Error(`bundle artifact 不能包含符号链接：${childRelative}`);
    }
    if (status.isDirectory()) {
      if (entry.name.endsWith('.vngame')) {
        bundles.push(await realpath(childPath));
      } else {
        bundles.push(...await discoverBundles(root, childRelative));
      }
    } else if (status.isFile()) {
      throw new Error(`bundle artifact 在 .vngame 外包含文件：${childRelative}`);
    } else {
      throw new Error(`bundle artifact 包含非普通条目：${childRelative}`);
    }
  }
  return bundles;
}

async function main() {
  const values = commandOptions({
    input: { type: 'string' },
    target: { type: 'string' },
  });
  const input = path.resolve(requiredOption(values, 'input'));
  const inputStatus = await lstat(input);
  if (inputStatus.isSymbolicLink() || !inputStatus.isDirectory()) {
    throw new Error('bundle artifact 输入必须是非链接目录');
  }
  const canonicalInput = await realpath(input);
  const topLevelNames = new Set(await readdir(canonicalInput));
  const isFlattenedBundle =
    topLevelNames.has('game.json') && topLevelNames.has('manifest.json');
  if (isFlattenedBundle) {
    // upload-artifact may omit the selected directory itself and retain only
    // its contents. Strict bundle validation remains the authority here.
    await verifyRuntimeBundle(canonicalInput);
  }
  const bundles = isFlattenedBundle
    ? [canonicalInput]
    : await discoverBundles(canonicalInput);
  if (bundles.length !== 1) {
    throw new Error(`bundle artifact 必须且只能包含一个 .vngame 目录，实际为 ${bundles.length} 个`);
  }
  await copyVerifiedDirectory(
    bundles[0],
    path.resolve(requiredOption(values, 'target')),
  );
  process.stdout.write('bundle artifact 已严格验证并准备为 embedded game\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
