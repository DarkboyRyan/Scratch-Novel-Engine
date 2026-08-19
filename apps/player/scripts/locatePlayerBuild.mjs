#!/usr/bin/env node

import { appendFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  locatePackagedApplication,
  requiredOption,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    'out-dir': { type: 'string' },
    platform: { type: 'string' },
    'github-output': { type: 'string' },
  });
  const app = await locatePackagedApplication(
    path.resolve(requiredOption(values, 'out-dir')),
    enumOption(values, 'platform', ['darwin', 'win32', 'linux']),
  );
  const outputPath = values['github-output'];
  if (typeof outputPath === 'string' && outputPath.length !== 0) {
    await appendFile(outputPath, `app_path=${app}\n`, 'utf8');
  }
  process.stdout.write(`${app}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
