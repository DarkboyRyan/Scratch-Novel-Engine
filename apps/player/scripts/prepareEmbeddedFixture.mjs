#!/usr/bin/env node

import path from 'node:path';

import {
  commandOptions,
  copyVerifiedDirectory,
  requiredOption,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    source: { type: 'string' },
    target: { type: 'string' },
  });
  const source = path.resolve(requiredOption(values, 'source'));
  const target = path.resolve(requiredOption(values, 'target'));
  await copyVerifiedDirectory(source, target);
  process.stdout.write(`已准备并复验 embedded game：${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
