#!/usr/bin/env node
/**
 * 主要作用：交叉校验 macOS/Windows Editor ZIP 并生成最终发布目录。
 * 关键函数与实现：main；输出两份 ZIP、release-set.json 与 SHA256SUMS。
 */
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  requiredOption,
} from '../../player/scripts/lib/releaseTools.mjs';
import { verifyEditorReleaseSet } from './lib/editorReleaseTools.mjs';

async function main() {
  const values = commandOptions({
    input: { type: 'string' },
    output: { type: 'string' },
    classification: { type: 'string' },
    version: { type: 'string' },
    commit: { type: 'string' },
  });
  const result = await verifyEditorReleaseSet({
    inputDirectory: path.resolve(requiredOption(values, 'input')),
    outputDirectory: path.resolve(requiredOption(values, 'output')),
    classification: enumOption(
      values,
      'classification',
      ['internal', 'release'],
    ),
    version: requiredOption(values, 'version'),
    gitCommit: requiredOption(values, 'commit'),
  });
  process.stdout.write(
    `Editor 发布集校验通过：${result.classification}/${result.files.length} 个 ZIP\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
