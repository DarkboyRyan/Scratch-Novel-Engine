#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  mkdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  commandOptions,
  enumOption,
  locatePackagedApplication,
  requiredOption,
} from './lib/releaseTools.mjs';
import {
  APPLICATION_METADATA_FILE,
  GAME_RESOURCE_DIRECTORY,
  GENERIC_PLAYER_ARTIFACT_ENTRY,
  MACOS_INFO_PLIST_FILE,
  verifyGenericMacosPlayerTemplate,
} from './lib/macosPlayerTemplate.mjs';

function runChecked(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`${command} 模板复制失败：${`${result.stderr ?? ''}${result.stdout ?? ''}`.trim()}`);
  }
  return result.stdout.trim();
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('首版 Editor Player 模板只能在 macOS runner 生成');
  }
  const values = commandOptions({
    'out-dir': { type: 'string' },
    output: { type: 'string' },
    arch: { type: 'string' },
    version: { type: 'string' },
  });
  const arch = enumOption(values, 'arch', ['arm64', 'x64']);
  const version = requiredOption(values, 'version');
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)) {
    throw new Error('--version 必须是 x.y.z 数字版本');
  }
  const output = path.resolve(requiredOption(values, 'output'));
  if (existsSync(output)) {
    throw new Error('Player 模板输出目录必须不存在');
  }
  await mkdir(path.dirname(output), { recursive: true });
  const staging = path.join(
    path.dirname(output),
    `.${path.basename(output)}.${randomUUID()}.staging`,
  );
  const sourceApp = await locatePackagedApplication(
    path.resolve(requiredOption(values, 'out-dir')),
    'darwin',
  );
  await verifyGenericMacosPlayerTemplate({ appPath: sourceApp, arch, version });

  try {
    const payloadRoot = path.join(staging, 'payload');
    const stagedApp = path.join(payloadRoot, GENERIC_PLAYER_ARTIFACT_ENTRY);
    await mkdir(payloadRoot, { recursive: true });
    // `fs.cp` rewrites relative framework symlinks on macOS unless carefully
    // configured, which changes the sealed bundle. `ditto` is Apple's
    // bundle-aware byte-preserving copier and keeps the existing signature.
    runChecked('ditto', [sourceApp, stagedApp]);
    await verifyGenericMacosPlayerTemplate({ appPath: stagedApp, arch, version });
    const manifest = {
      format: 'vn-engine-player-template',
      templateVersion: 1,
      platform: 'darwin',
      arch,
      playerVersion: version,
      runtimeCompatibility: '>=1 <5',
      payloadRoot: 'payload',
      artifactEntry: GENERIC_PLAYER_ARTIFACT_ENTRY,
      gameResourceDirectory: GAME_RESOURCE_DIRECTORY,
      applicationMetadataFile: APPLICATION_METADATA_FILE,
      macosInfoPlistFile: MACOS_INFO_PLIST_FILE,
    };
    await writeFile(
      path.join(staging, 'player-template.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    await rename(staging, output);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(`Player 模板已生成：${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
