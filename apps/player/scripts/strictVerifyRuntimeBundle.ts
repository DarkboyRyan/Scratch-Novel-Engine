#!/usr/bin/env node

import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadRuntimeBundle } from '../src/main/content/PlayerBundleLoader';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      bundle: { type: 'string' },
    },
    strict: true,
  });
  if (typeof values.bundle !== 'string' || values.bundle.length === 0) {
    throw new Error('--bundle 是必填目录');
  }
  const loaded = await loadRuntimeBundle(path.resolve(values.bundle));
  process.stdout.write(`${JSON.stringify({
    projectId: loaded.game.project.id,
    assetCount: loaded.assets.size,
  })}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
