#!/usr/bin/env node
/**
 * 主要作用：定位唯一的 macOS 或 Windows Editor 打包目录。
 * 关键函数与实现：main；可把 app_path 写入 GitHub Actions 输出文件。
 */
import { appendFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  requiredOption,
} from '../../player/scripts/lib/releaseTools.mjs';
import { locatePackagedEditor } from './lib/editorReleaseTools.mjs';

async function main() {
  const values = commandOptions({
    'out-dir': { type: 'string' },
    platform: { type: 'string' },
    'github-output': { type: 'string' },
  });
  const app = await locatePackagedEditor(
    path.resolve(requiredOption(values, 'out-dir')),
    enumOption(values, 'platform', ['darwin', 'win32']),
  );
  if (typeof values['github-output'] === 'string' && values['github-output'] !== '') {
    await appendFile(values['github-output'], `app_path=${app}\n`, 'utf8');
  }
  process.stdout.write(`${app}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
