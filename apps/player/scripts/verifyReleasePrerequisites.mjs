#!/usr/bin/env node
/**
 * 主要作用：在发布前检查工具链与平台签名密钥是否齐备。
 * 关键函数与实现：`REQUIRED_SECRETS`、`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertReadableFile,
  commandOptions,
  requiredOption,
} from './lib/releaseTools.mjs';

const REQUIRED_SECRETS = [
  'MACOS_CERTIFICATE_BASE64',
  'MACOS_CERTIFICATE_PASSWORD',
  'MACOS_SIGNING_IDENTITY',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
  'WINDOWS_CERTIFICATE_BASE64',
  'WINDOWS_CERTIFICATE_PASSWORD',
  'PLAYER_ICON_ICNS_BASE64',
  'PLAYER_ICON_ICO_BASE64',
  'PLAYER_ICON_PNG_BASE64',
  'RELEASE_GPG_PRIVATE_KEY_BASE64',
  'RELEASE_GPG_PASSPHRASE',
  'RELEASE_GPG_FINGERPRINT',
];

async function main() {
  const values = commandOptions({
    package: { type: 'string' },
    tag: { type: 'string' },
    commit: { type: 'string' },
  });
  const packagePath = path.resolve(requiredOption(values, 'package'));
  await assertReadableFile(packagePath, 'Player package.json');
  const packageDocument = JSON.parse(await readFile(packagePath, 'utf8'));
  if (
    typeof packageDocument !== 'object' ||
    packageDocument === null ||
    packageDocument.name !== 'player' ||
    typeof packageDocument.version !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(packageDocument.version)
  ) {
    throw new Error('Player package.json 的名称或版本无效');
  }
  const expectedTag = `player-v${packageDocument.version}`;
  const tag = requiredOption(values, 'tag');
  if (tag !== expectedTag) {
    throw new Error(`正式发布标签必须精确为 ${expectedTag}`);
  }
  const commit = requiredOption(values, 'commit');
  if (!/^[a-f0-9]{40}$/u.test(commit)) {
    throw new Error('正式发布提交必须是 40 位小写 Git SHA');
  }
  const missing = REQUIRED_SECRETS.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === '';
  });
  if (missing.length !== 0) {
    throw new Error(
      `未创建正式发布：缺少 ${missing.join(', ')}。普通 CI 产物仍明确属于 internal unsigned/ad-hoc。`,
    );
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath === undefined || outputPath === '') {
    throw new Error('正式发布预检必须运行在 GitHub Actions 且提供 GITHUB_OUTPUT');
  }
  await appendFile(
    outputPath,
    `version=${packageDocument.version}\ntag=${tag}\ncommit=${commit}\n`,
    'utf8',
  );
  process.stdout.write(`正式发布预检通过：${tag}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
