#!/usr/bin/env node
/**
 * 主要作用：为正式 Editor 发布应用 Developer ID 或 Authenticode 签名。
 * 关键函数与实现：canonicalAppDirectory、main；证书路径和密码只从环境变量读取。
 */
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  assertReadableFile,
  commandOptions,
  enumOption,
  requiredOption,
} from '../../player/scripts/lib/releaseTools.mjs';
import {
  macSignOptions,
  windowsSignOptions,
} from '../../player/scripts/lib/signingPolicy.mjs';

function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`缺少 Editor 签名环境变量 ${name}`);
  }
  return value;
}

async function canonicalAppDirectory(value, platform) {
  if (!path.isAbsolute(value) || value.includes('\0')) {
    throw new Error('--app 必须是安全的绝对路径');
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
    throw new Error(`必须在 ${platform} runner 上执行 Editor 签名`);
  }
  const app = await canonicalAppDirectory(requiredOption(values, 'app'), platform);
  const certificatePath = requiredEnvironment('EDITOR_SIGNING_CERTIFICATE_PATH');
  await assertReadableFile(certificatePath, 'Editor 签名证书');
  const certificatePassword = requiredEnvironment(
    'EDITOR_SIGNING_CERTIFICATE_PASSWORD',
  );

  if (platform === 'darwin') {
    const { signAsync } = await import('@electron/osx-sign');
    await signAsync(macSignOptions({
      app,
      identity: requiredEnvironment('EDITOR_SIGNING_IDENTITY'),
      keychain: requiredEnvironment('EDITOR_SIGNING_KEYCHAIN'),
    }));
  } else {
    const { sign } = await import('@electron/windows-sign');
    await sign(windowsSignOptions({
      appDirectory: app,
      certificateFile: certificatePath,
      certificatePassword,
      description: 'VN Engine Editor',
    }));
  }
  process.stdout.write(`${platform} Editor 签名完成\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
