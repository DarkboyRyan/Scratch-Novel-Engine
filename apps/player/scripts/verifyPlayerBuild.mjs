#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  requiredOption,
  verifyPackagedPlayer,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    'out-dir': { type: 'string' },
    platform: { type: 'string' },
    arch: { type: 'string' },
    mode: { type: 'string' },
    classification: { type: 'string' },
    product: { type: 'string' },
    version: { type: 'string' },
    'app-bundle-id': { type: 'string' },
    icon: { type: 'string' },
    commit: { type: 'string' },
    receipt: { type: 'string' },
  });
  const platform = enumOption(values, 'platform', ['darwin', 'win32', 'linux']);
  const arch = enumOption(values, 'arch', ['arm64', 'x64']);
  const mode = enumOption(values, 'mode', ['generic', 'embedded']);
  const classification = enumOption(values, 'classification', ['internal', 'release']);
  const version = requiredOption(values, 'version');
  if (
    version.length > 32 ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)
  ) {
    throw new Error('--version 必须是 x.y.z 数字版本');
  }
  const gitCommit = requiredOption(values, 'commit');
  if (gitCommit !== 'local' && !/^[a-f0-9]{40}$/u.test(gitCommit)) {
    throw new Error('--commit 必须是 40 位小写 Git SHA 或 local');
  }
  const receiptPath = path.resolve(requiredOption(values, 'receipt'));
  const appBundleId = requiredOption(values, 'app-bundle-id');
  if (
    appBundleId.length > 155 ||
    !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/u.test(appBundleId)
  ) {
    throw new Error('--app-bundle-id 必须是安全的 reverse-DNS ID');
  }
  const receipt = await verifyPackagedPlayer({
    outDirectory: path.resolve(requiredOption(values, 'out-dir')),
    platform,
    arch,
    mode,
    classification,
    productName: requiredOption(values, 'product'),
    version,
    appBundleId,
    iconPath: typeof values.icon === 'string' ? path.resolve(values.icon) : null,
    gitCommit,
  });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  process.stdout.write(
    `Player 校验通过：${classification}/${platform}/${arch}/${mode}/${receipt.signature}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
