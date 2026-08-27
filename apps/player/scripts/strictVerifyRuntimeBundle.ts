#!/usr/bin/env node
/**
 * 主要作用：调用 Player 严格解析器验证运行包的结构和引用。
 * 关键函数与实现：`main`；以 TypeScript 类型边界和可组合函数实现。
 */

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
