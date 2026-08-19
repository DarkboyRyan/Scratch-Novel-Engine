#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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
} from './lib/releaseTools.mjs';

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

  if (process.platform !== 'darwin') {
    runChecked(process.execPath, editorForgeArguments, {
      cwd: editorDirectory,
      env: process.env,
    });
    return;
  }
  if (process.arch !== 'arm64' && process.arch !== 'x64') {
    throw new Error(`不支持为 ${process.arch} 生成 macOS Player 模板`);
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

  // Desktop/FileProvider folders can attach xattrs that invalidate an app
  // signature. Keep the unsigned template build and template staging in the
  // native temporary directory until Forge has copied it into the Editor.
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'vn-editor-player-template-'),
  );
  const packageOut = path.join(temporaryRoot, 'player-out');
  const templatesRoot = path.join(temporaryRoot, 'player-templates');
  const templateRoot = path.join(templatesRoot, `darwin-${process.arch}`);
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
  try {
    runChecked('pnpm', ['--dir', 'apps/player', 'package'], {
      cwd: repositoryRoot,
      env: playerEnvironment,
    });
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
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
