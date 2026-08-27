#!/usr/bin/env node
/**
 * 主要作用：在构建输出中定位唯一且匹配目标平台的 Player 制品。
 * 关键函数与实现：`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { appendFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  locatePackagedApplication,
  requiredOption,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    'out-dir': { type: 'string' },
    platform: { type: 'string' },
    'github-output': { type: 'string' },
  });
  const app = await locatePackagedApplication(
    path.resolve(requiredOption(values, 'out-dir')),
    enumOption(values, 'platform', ['darwin', 'win32', 'linux']),
  );
  const outputPath = values['github-output'];
  if (typeof outputPath === 'string' && outputPath.length !== 0) {
    await appendFile(outputPath, `app_path=${app}\n`, 'utf8');
  }
  process.stdout.write(`${app}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
