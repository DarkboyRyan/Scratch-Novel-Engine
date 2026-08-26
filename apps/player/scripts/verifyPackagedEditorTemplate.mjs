#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import {
  lstat,
  readFile,
  readdir,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  requiredOption,
} from './lib/releaseTools.mjs';
import {
  GENERIC_PLAYER_ARTIFACT_ENTRY,
  verifyGenericMacosPlayerTemplate,
} from './lib/macosPlayerTemplate.mjs';

async function oneEditorApp(outDirectory) {
  const out = path.resolve(outDirectory);
  const outStatus = await lstat(out);
  if (outStatus.isSymbolicLink() || !outStatus.isDirectory()) {
    throw new Error('Editor out 必须是非链接目录');
  }
  const candidates = [];
  for (const packageEntry of await readdir(out, { withFileTypes: true })) {
    if (!packageEntry.isDirectory() || packageEntry.name === 'make') {
      continue;
    }
    const packageDirectory = path.join(out, packageEntry.name);
    for (const entry of await readdir(packageDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && entry.name.endsWith('.app')) {
        candidates.push(path.join(packageDirectory, entry.name));
      }
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`必须且只能找到一个 packaged Editor .app，实际为 ${candidates.length} 个`);
  }
  return realpath(candidates[0]);
}

async function requireRegularFile(filePath, context) {
  const status = await lstat(filePath);
  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1 || status.size <= 0) {
    throw new Error(`${context} 必须是非链接、非硬链接普通文件`);
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('Editor 内置 Player 模板验收只在 macOS runner 执行');
  }
  const values = commandOptions({
    'out-dir': { type: 'string' },
    arch: { type: 'string' },
    'player-version': { type: 'string' },
  });
  const arch = enumOption(values, 'arch', ['arm64', 'x64']);
  const playerVersion = requiredOption(values, 'player-version');
  const editorApp = await oneEditorApp(requiredOption(values, 'out-dir'));
  const editorSignature = spawnSync(
    'codesign',
    ['--verify', '--deep', '--strict', editorApp],
    { encoding: 'utf8' },
  );
  if (editorSignature.error !== undefined || editorSignature.status !== 0) {
    throw new Error(
      `packaged Editor 签名损坏：${`${editorSignature.stderr ?? ''}${editorSignature.stdout ?? ''}`.trim()}`,
    );
  }
  const templateRoot = path.join(
    editorApp,
    'Contents',
    'Resources',
    'player-templates',
    `darwin-${arch}`,
  );
  const manifestPath = path.join(templateRoot, 'player-template.json');
  await requireRegularFile(manifestPath, 'packaged player-template.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expected = {
    format: 'vn-engine-player-template',
    templateVersion: 1,
    platform: 'darwin',
    arch,
    playerVersion,
    runtimeCompatibility: '>=1 <8',
    payloadRoot: 'payload',
    artifactEntry: GENERIC_PLAYER_ARTIFACT_ENTRY,
    gameResourceDirectory: 'Contents/Resources/game',
    applicationMetadataFile: 'Contents/Resources/vn-game-application.json',
    macosInfoPlistFile: 'Contents/Info.plist',
  };
  if (!isDeepStrictEqual(manifest, expected)) {
    throw new Error('packaged Editor 内的 player-template.json 不符合 exact 契约');
  }
  const playerApp = path.join(templateRoot, 'payload', expected.artifactEntry);
  const playerStatus = await lstat(playerApp);
  if (playerStatus.isSymbolicLink() || !playerStatus.isDirectory()) {
    throw new Error('packaged Editor 的 Player 模板应用不合法');
  }
  await verifyGenericMacosPlayerTemplate({
    appPath: playerApp,
    arch,
    version: playerVersion,
    rejectHardlinks: true,
  });
  process.stdout.write(`packaged Editor 模板验收通过：darwin-${arch}/${playerVersion}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
