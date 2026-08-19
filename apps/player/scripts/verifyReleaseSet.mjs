#!/usr/bin/env node

import path from 'node:path';

import {
  commandOptions,
  requiredOption,
  verifyReleaseSet,
} from './lib/releaseTools.mjs';

async function main() {
  const values = commandOptions({
    input: { type: 'string' },
    output: { type: 'string' },
    version: { type: 'string' },
    commit: { type: 'string' },
  });
  const releaseSet = await verifyReleaseSet({
    inputDirectory: path.resolve(requiredOption(values, 'input')),
    outputDirectory: path.resolve(requiredOption(values, 'output')),
    version: requiredOption(values, 'version'),
    gitCommit: requiredOption(values, 'commit'),
  });
  process.stdout.write(
    `正式发布集校验通过：${releaseSet.targets.length} 个平台、${releaseSet.files.length} 个产物\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
