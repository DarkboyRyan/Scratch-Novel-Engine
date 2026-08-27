#!/usr/bin/env node
/**
 * 主要作用：把 CI 中的规范 Base64 密钥安全落地为临时文件。
 * 关键函数与实现：`decodeCanonicalBase64`、`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  requiredOption,
} from './lib/releaseTools.mjs';

function decodeCanonicalBase64(value, environmentName) {
  const compact = value.replace(/\s/gu, '');
  if (
    compact.length === 0 ||
    compact.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(compact)
  ) {
    throw new Error(`${environmentName} 不是规范 Base64`);
  }
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== compact) {
    throw new Error(`${environmentName} Base64 解码失败`);
  }
  return bytes;
}

async function main() {
  const values = commandOptions({
    environment: { type: 'string' },
    output: { type: 'string' },
  });
  const environmentName = requiredOption(values, 'environment');
  if (!/^[A-Z][A-Z0-9_]*$/u.test(environmentName)) {
    throw new Error('--environment 不是安全的环境变量名');
  }
  const encoded = process.env[environmentName];
  if (encoded === undefined || encoded === '') {
    throw new Error(`缺少 ${environmentName}`);
  }
  const output = path.resolve(requiredOption(values, 'output'));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, decodeCanonicalBase64(encoded, environmentName), {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(`已安全写入 ${path.basename(output)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
