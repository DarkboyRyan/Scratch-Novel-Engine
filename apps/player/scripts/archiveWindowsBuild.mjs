#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  requiredOption,
} from './lib/releaseTools.mjs';
import { windowsArchiveInvocation } from './lib/windowsPowerShellPolicy.mjs';

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Windows Player ZIP 必须在 Windows runner 生成');
  }
  const values = commandOptions({
    source: { type: 'string' },
    output: { type: 'string' },
  });
  const sourceInput = path.resolve(requiredOption(values, 'source'));
  const sourceStatus = await lstat(sourceInput);
  if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory()) {
    throw new Error('--source 必须是非链接应用目录');
  }
  const source = await realpath(sourceInput);
  const output = path.resolve(requiredOption(values, 'output'));
  if (path.extname(output).toLowerCase() !== '.zip' || existsSync(output)) {
    throw new Error('--output 必须是尚不存在的绝对 .zip 路径');
  }
  await mkdir(path.dirname(output), { recursive: true });
  const invocation = windowsArchiveInvocation(source, output);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env: invocation.environment,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`Windows Compress-Archive 失败：${`${result.stderr ?? ''}${result.stdout ?? ''}`.trim()}`);
  }
  if ((await stat(output)).size <= 0) {
    throw new Error('Windows Compress-Archive 生成了空文件');
  }
  process.stdout.write(`Windows Player ZIP 已生成：${path.basename(output)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
