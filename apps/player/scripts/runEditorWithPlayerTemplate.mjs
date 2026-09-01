#!/usr/bin/env node
/**
 * 主要作用：以指定 Player 模板启动 Editor 的端到端导出验证。
 * 关键函数与实现：`runChecked`、`recordPackagePhase`、`main`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  commandOptions,
  enumOption,
  resolvePnpmLauncher,
} from './lib/releaseTools.mjs';

const PACKAGE_PHASE_REPORT_MODE = 'github-output';
const PACKAGE_PHASE_OUTPUT_NAME = 'editor_package_phase';
const PACKAGE_PHASES = new Set([
  'web-template',
  'native-template-setup',
  'player-package',
  'player-template-stage',
  'editor-forge',
  'temporary-cleanup',
]);

function recordPackagePhase(phase) {
  if (!PACKAGE_PHASES.has(phase)) {
    throw new Error('无效的 Editor 打包阶段');
  }
  if (
    process.env.VN_EDITOR_PACKAGE_PHASE_REPORT !== PACKAGE_PHASE_REPORT_MODE ||
    process.env.GITHUB_ACTIONS !== 'true' ||
    typeof process.env.GITHUB_OUTPUT !== 'string' ||
    process.env.GITHUB_OUTPUT.length === 0
  ) {
    return;
  }
  try {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${PACKAGE_PHASE_OUTPUT_NAME}=${phase}\n`,
      { encoding: 'utf8' },
    );
  } catch {
    // Diagnostics must never turn a valid package operation into a failure.
  }
}

function runChecked(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 执行失败`);
  }
}

async function main() {
  const values = commandOptions({ command: { type: 'string' } });
  const forgeCommand = enumOption(
    values,
    'command',
    ['start', 'package', 'make', 'publish'],
  );
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
  const editorDirectory = path.join(repositoryRoot, 'apps', 'editor');
  const forgeCliPath = path.join(
    repositoryRoot,
    'node_modules',
    '@electron-forge',
    'cli',
    'dist',
    'electron-forge.js',
  );
  const editorForgeArguments = [forgeCliPath, forgeCommand];

  // Web exports consume an immutable, pre-built template. Build and stage it
  // before Forge starts so clicking Export never invokes Vite at runtime.
  const pnpmLauncher = resolvePnpmLauncher({ repositoryRoot });
  recordPackagePhase('web-template');
  runChecked(pnpmLauncher.command, [
    ...pnpmLauncher.args,
    '--dir',
    'apps/player',
    'prepare:web-template',
  ], {
    cwd: repositoryRoot,
    env: process.env,
  });

  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    recordPackagePhase('editor-forge');
    runChecked(process.execPath, editorForgeArguments, {
      cwd: editorDirectory,
      env: process.env,
    });
    return;
  }
  recordPackagePhase('native-template-setup');
  if (
    (process.platform === 'darwin' &&
      process.arch !== 'arm64' &&
      process.arch !== 'x64') ||
    (process.platform === 'win32' && process.arch !== 'x64')
  ) {
    throw new Error(
      `不支持为 ${process.platform}-${process.arch} 生成 Player 模板`,
    );
  }

  const playerPackage = JSON.parse(
    await readFile(path.join(repositoryRoot, 'apps', 'player', 'package.json'), 'utf8'),
  );
  if (
    typeof playerPackage.version !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(playerPackage.version)
  ) {
    throw new Error('Player package version 无效');
  }

  // Keep template build and staging in the native temporary directory. On
  // macOS this avoids FileProvider xattrs invalidating the app signature; on
  // Windows it also keeps the large package tree out of the source checkout.
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'vn-editor-player-template-'),
  );
  const packageOut = path.join(temporaryRoot, 'player-out');
  const templatesRoot = path.join(temporaryRoot, 'player-templates');
  const templateRoot = path.join(
    templatesRoot,
    `${process.platform}-${process.arch}`,
  );
  await mkdir(templatesRoot, { recursive: true });

  const playerEnvironment = {
    ...process.env,
    VN_PLAYER_PRODUCT_NAME: '',
    VN_PLAYER_VERSION: '',
    VN_PLAYER_APP_BUNDLE_ID: '',
    VN_PLAYER_ICON_PATH: '',
    VN_PLAYER_EMBEDDED_GAME_DIR: '',
    VN_PLAYER_OUT_DIR: packageOut,
  };
  let packageOperationFailed = false;
  try {
    recordPackagePhase('player-package');
    runChecked(pnpmLauncher.command, [
      ...pnpmLauncher.args,
      '--dir',
      'apps/player',
      'package',
    ], {
      cwd: repositoryRoot,
      env: playerEnvironment,
    });
    recordPackagePhase('player-template-stage');
    runChecked(
      process.execPath,
      [
        path.join(scriptDirectory, 'stagePlayerTemplate.mjs'),
        '--out-dir',
        packageOut,
        '--output',
        templateRoot,
        '--arch',
        process.arch,
        '--version',
        playerPackage.version,
      ],
      { cwd: repositoryRoot, env: process.env },
    );
    recordPackagePhase('editor-forge');
    runChecked(process.execPath, editorForgeArguments, {
      cwd: editorDirectory,
      env: {
        ...process.env,
        // Forge consumes the parent directory as Resources/player-templates.
        VN_EDITOR_PLAYER_TEMPLATES_DIR: templatesRoot,
        // Main uses the exact target during `electron-forge start`; packaged
        // builds ignore this override after the build process exits.
        VN_PLAYER_TEMPLATE_ROOT: templateRoot,
      },
    });
  } catch (error) {
    packageOperationFailed = true;
    throw error;
  } finally {
    if (!packageOperationFailed) {
      recordPackagePhase('temporary-cleanup');
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
