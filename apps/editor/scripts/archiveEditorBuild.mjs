#!/usr/bin/env node
/**
 * 主要作用：以平台原生工具归档已验证 Editor，并回读 ZIP 关键文件哈希。
 * 关键函数与实现：main；macOS 使用 ditto，Windows 使用受限 PowerShell 参数策略。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  requiredOption,
} from '../../player/scripts/lib/releaseTools.mjs';
import { recordEditorArchivePhase } from './lib/archivePhaseReporter.mjs';
import { archiveEditorApplication } from './lib/editorReleaseTools.mjs';

async function main() {
  recordEditorArchivePhase('input');
  const values = commandOptions({
    platform: { type: 'string' },
    source: { type: 'string' },
    output: { type: 'string' },
    receipt: { type: 'string' },
  });
  const platform = enumOption(values, 'platform', ['darwin', 'win32']);
  const receipt = JSON.parse(
    await readFile(path.resolve(requiredOption(values, 'receipt')), 'utf8'),
  );
  const artifact = await archiveEditorApplication({
    platform,
    sourceDirectory: path.resolve(requiredOption(values, 'source')),
    outputPath: path.resolve(requiredOption(values, 'output')),
    receipt,
    recordPhase: recordEditorArchivePhase,
  });
  process.stdout.write(
    `Editor ZIP 已生成并验证：${artifact.name} (${artifact.entryCount} entries)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
