#!/usr/bin/env node
/**
 * 主要作用：按平台签名 macOS 或 Windows Player 构建。
 * 关键函数与实现：`requiredEnvironment`、`canonicalAppDirectory`、`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  assertReadableFile,
  commandOptions,
  enumOption,
  requiredOption,
} from './lib/releaseTools.mjs';
import {
  macSignOptions,
  windowsSignOptions,
} from './lib/signingPolicy.mjs';

function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`缺少签名环境变量 ${name}`);
  }
  return value;
}

async function canonicalAppDirectory(value, platform) {
  if (!path.isAbsolute(value)) {
    throw new Error('--app 必须是绝对路径');
  }
  const status = await lstat(value);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('--app 必须是非链接目录');
  }
  if (platform === 'darwin' && !value.endsWith('.app')) {
    throw new Error('macOS --app 必须指向 .app');
  }
  return realpath(value);
}

async function main() {
  const values = commandOptions({
    platform: { type: 'string' },
    app: { type: 'string' },
  });
  const platform = enumOption(values, 'platform', ['darwin', 'win32']);
  if (process.platform !== platform) {
    throw new Error(`必须在 ${platform} runner 上执行平台签名`);
  }
  const app = await canonicalAppDirectory(requiredOption(values, 'app'), platform);
  const certificatePath = requiredEnvironment('PLAYER_SIGNING_CERTIFICATE_PATH');
  await assertReadableFile(certificatePath, '签名证书');
  const certificatePassword = requiredEnvironment('PLAYER_SIGNING_CERTIFICATE_PASSWORD');

  if (platform === 'darwin') {
    const identity = requiredEnvironment('PLAYER_SIGNING_IDENTITY');
    const keychain = requiredEnvironment('PLAYER_SIGNING_KEYCHAIN');
    const { signAsync } = await import('@electron/osx-sign');
    await signAsync(macSignOptions({
      app,
      identity,
      keychain,
    }));
  } else {
    const { sign } = await import('@electron/windows-sign');
    await sign(windowsSignOptions({
      appDirectory: app,
      certificateFile: certificatePath,
      certificatePassword,
    }));
  }
  process.stdout.write(`${platform} 平台签名完成\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
