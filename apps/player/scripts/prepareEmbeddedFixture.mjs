#!/usr/bin/env node
/**
 * 主要作用：准备 CI 使用的最小嵌入式游戏测试夹具。
 * 关键函数与实现：`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import path from 'node:path';

import {
  commandOptions,
  copyVerifiedDirectory,
  requiredOption,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    source: { type: 'string' },
    target: { type: 'string' },
  });
  const source = path.resolve(requiredOption(values, 'source'));
  const target = path.resolve(requiredOption(values, 'target'));
  await copyVerifiedDirectory(source, target);
  process.stdout.write(`已准备并复验 embedded game：${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
