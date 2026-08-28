#!/usr/bin/env node
/**
 * 主要作用：收集单个平台 Editor ZIP、验证回执并生成 SHA-256 清单。
 * 关键函数与实现：main；拒绝额外输入文件并以不可覆盖方式写入候选目录。
 */
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  requiredOption,
} from '../../player/scripts/lib/releaseTools.mjs';
import { collectEditorArtifacts } from './lib/editorReleaseTools.mjs';

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
  const manifest = await collectEditorArtifacts({
    inputDirectory: path.resolve(requiredOption(values, 'input')),
    outputDirectory: path.resolve(requiredOption(values, 'output')),
    receiptPath: path.resolve(requiredOption(values, 'receipt')),
    classification: enumOption(
      values,
      'classification',
      ['internal', 'release'],
    ),
    platform: enumOption(values, 'platform', ['darwin', 'win32']),
    arch: enumOption(values, 'arch', ['arm64', 'x64']),
    version: requiredOption(values, 'version'),
    gitCommit: requiredOption(values, 'commit'),
  });
  process.stdout.write(
    `已收集 ${manifest.platform}-${manifest.arch} Editor ZIP 并生成清单\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
