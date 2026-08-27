#!/usr/bin/env node
/**
 * 主要作用：交叉校验多平台发布集、收据与制品哈希。
 * 关键函数与实现：`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import path from 'node:path';

import {
  commandOptions,
  requiredOption,
  verifyReleaseSet,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    input: { type: 'string' },
    output: { type: 'string' },
    version: { type: 'string' },
    commit: { type: 'string' },
  });
  const releaseSet = await verifyReleaseSet({
    inputDirectory: path.resolve(requiredOption(values, 'input')),
    outputDirectory: path.resolve(requiredOption(values, 'output')),
    version: requiredOption(values, 'version'),
    gitCommit: requiredOption(values, 'commit'),
  });
  process.stdout.write(
    `正式发布集校验通过：${releaseSet.targets.length} 个平台、${releaseSet.files.length} 个产物\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
