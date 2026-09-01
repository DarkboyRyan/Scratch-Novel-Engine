#!/usr/bin/env node
/**
 * 主要作用：严格验证打包后的 Editor、内置后端、两类 Player 模板和签名。
 * 关键函数与实现：main；生成归档阶段必须消费的不可覆盖 JSON 回执。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  requiredOption,
} from '../../player/scripts/lib/releaseTools.mjs';
import { verifyPackagedEditor } from './lib/editorReleaseTools.mjs';

async function main() {
  const values = commandOptions({
    'out-dir': { type: 'string' },
    platform: { type: 'string' },
    arch: { type: 'string' },
    classification: { type: 'string' },
    product: { type: 'string' },
    version: { type: 'string' },
    'app-bundle-id': { type: 'string' },
    'player-version': { type: 'string' },
    commit: { type: 'string' },
    receipt: { type: 'string' },
  });
  const receiptPath = path.resolve(requiredOption(values, 'receipt'));
  const receipt = await verifyPackagedEditor({
    outDirectory: path.resolve(requiredOption(values, 'out-dir')),
    platform: enumOption(values, 'platform', ['darwin', 'win32']),
    arch: enumOption(values, 'arch', ['arm64', 'x64']),
    classification: enumOption(
      values,
      'classification',
      ['internal', 'release'],
    ),
    productName: requiredOption(values, 'product'),
    version: requiredOption(values, 'version'),
    appBundleId: requiredOption(values, 'app-bundle-id'),
    playerVersion: requiredOption(values, 'player-version'),
    gitCommit: requiredOption(values, 'commit'),
  });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  process.stdout.write(
    `Editor 校验通过：${receipt.classification}/${receipt.platform}/${receipt.arch}/${receipt.signature}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
