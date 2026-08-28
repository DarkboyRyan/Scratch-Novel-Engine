#!/usr/bin/env node
/**
 * 主要作用：校验并暂存桌面 Player 模板供 Editor 导出使用。
 * 关键函数与实现：`runChecked`、`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  cp,
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
  verifyPackagedPlayer,
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
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    throw new Error('Editor Player 模板只能在 macOS 或 Windows runner 生成');
  }
  const values = commandOptions({
    'out-dir': { type: 'string' },
    output: { type: 'string' },
    arch: { type: 'string' },
    version: { type: 'string' },
  });
  const arch = enumOption(values, 'arch', ['arm64', 'x64']);
  if (process.platform === 'win32' && arch !== 'x64') {
    throw new Error('Windows Editor Player 模板当前只支持 x64');
  }
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
    process.platform,
  );
  if (process.platform === 'darwin') {
    await verifyGenericMacosPlayerTemplate({ appPath: sourceApp, arch, version });
  } else {
    await verifyPackagedPlayer({
      outDirectory: path.resolve(requiredOption(values, 'out-dir')),
      platform: 'win32',
      arch,
      mode: 'generic',
      classification: 'internal',
      productName: 'VN Engine Player',
      version,
      appBundleId: 'com.vnengine.player',
      gitCommit: 'local',
    });
  }

  try {
    const payloadRoot = path.join(staging, 'payload');
    const artifactEntry = process.platform === 'darwin'
      ? GENERIC_PLAYER_ARTIFACT_ENTRY
      : 'VN Engine Player-win32-x64';
    const stagedApp = path.join(payloadRoot, artifactEntry);
    await mkdir(payloadRoot, { recursive: true });
    if (process.platform === 'darwin') {
      // `fs.cp` rewrites relative framework symlinks on macOS unless carefully
      // configured, which changes the sealed bundle. `ditto` is Apple's
      // bundle-aware byte-preserving copier and keeps the existing signature.
      runChecked('ditto', [sourceApp, stagedApp]);
      await verifyGenericMacosPlayerTemplate({ appPath: stagedApp, arch, version });
    } else {
      await cp(sourceApp, stagedApp, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
        verbatimSymlinks: true,
      });
      // Re-run the same packaged-Player contract from the staged payload. This
      // catches incomplete copies before Forge embeds the template in Editor.
      await verifyPackagedPlayer({
        outDirectory: payloadRoot,
        platform: 'win32',
        arch,
        mode: 'generic',
        classification: 'internal',
        productName: 'VN Engine Player',
        version,
        appBundleId: 'com.vnengine.player',
        gitCommit: 'local',
      });
    }
    const manifest = {
      format: 'vn-engine-player-template',
      templateVersion: 1,
      platform: process.platform,
      arch,
      playerVersion: version,
      runtimeCompatibility: '>=1 <11',
      payloadRoot: 'payload',
      artifactEntry,
      gameResourceDirectory: process.platform === 'darwin'
        ? GAME_RESOURCE_DIRECTORY
        : 'resources/game',
      applicationMetadataFile: process.platform === 'darwin'
        ? APPLICATION_METADATA_FILE
        : 'resources/vn-game-application.json',
      macosInfoPlistFile: process.platform === 'darwin'
        ? MACOS_INFO_PLIST_FILE
        : null,
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
