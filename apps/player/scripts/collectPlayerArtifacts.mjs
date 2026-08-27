#!/usr/bin/env node
/**
 * 主要作用：汇总 Player 平台产物并生成可审计的制品清单。
 * 关键函数与实现：`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import path from 'node:path';

import {
  collectArtifacts,
  commandOptions,
  enumOption,
  requiredOption,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    input: { type: 'string' },
    output: { type: 'string' },
    receipt: { type: 'string' },
    classification: { type: 'string' },
    platform: { type: 'string' },
    arch: { type: 'string' },
    version: { type: 'string' },
    commit: { type: 'string' },
  });
  const manifest = await collectArtifacts({
    inputDirectory: path.resolve(requiredOption(values, 'input')),
    outputDirectory: path.resolve(requiredOption(values, 'output')),
    receiptPath: path.resolve(requiredOption(values, 'receipt')),
    classification: enumOption(values, 'classification', ['internal', 'release']),
    platform: enumOption(values, 'platform', ['darwin', 'win32', 'linux']),
    arch: enumOption(values, 'arch', ['arm64', 'x64']),
    version: requiredOption(values, 'version'),
    gitCommit: requiredOption(values, 'commit'),
  });
  process.stdout.write(
    `已收集 ${manifest.files.length} 个 ${manifest.classification} 产物并生成 SHA-256\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
