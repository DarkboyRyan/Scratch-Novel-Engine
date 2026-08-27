/**
 * 文件主要作用：验证 standalone Player template contract 的行为。
 * 测试覆盖：`standalone Player template contract`。
 */

import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadStandalonePlayerTemplate,
  PLAYER_TEMPLATE_FORMAT,
  PLAYER_TEMPLATE_VERSION,
  resolveStandalonePlayerTemplateRoot,
} from '../../src/main/export/StandalonePlayerTemplate';

describe('standalone Player template contract', () => {
  const roots: string[] = [];

  async function createTemplate(overrides: Record<string, unknown> = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vn-player-template-'));
    roots.push(root);
    const macos = process.platform === 'darwin';
    const manifest = {
      format: PLAYER_TEMPLATE_FORMAT,
      templateVersion: PLAYER_TEMPLATE_VERSION,
      platform: process.platform,
      arch: process.arch,
      playerVersion: '0.1.0',
      runtimeCompatibility: '>=1 <10',
      payloadRoot: 'payload',
      artifactEntry: macos ? 'VN Engine Player.app' : 'player',
      gameResourceDirectory: macos
        ? 'Contents/Resources/game'
        : 'resources/game',
      applicationMetadataFile: macos
        ? 'Contents/Resources/vn-game-application.json'
        : 'resources/vn-game-application.json',
      macosInfoPlistFile: macos ? 'Contents/Info.plist' : null,
      ...overrides,
    };
    await mkdir(
      path.join(root, String(manifest.payloadRoot), String(manifest.artifactEntry)),
      { recursive: true },
    );
    await writeFile(
      path.join(root, 'player-template.json'),
      `${JSON.stringify(manifest)}\n`,
    );
    return root;
  }

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('loads an exact platform and architecture matched manifest', async () => {
    const root = await createTemplate();

    await expect(loadStandalonePlayerTemplate(root)).resolves.toMatchObject({
      rootPath: await realpath(root),
      manifest: {
        format: PLAYER_TEMPLATE_FORMAT,
        platform: process.platform,
        arch: process.arch,
      },
    });
  });

  it('rejects unknown fields and unsafe injection paths', async () => {
    const unknownField = await createTemplate({ extra: true });
    await expect(loadStandalonePlayerTemplate(unknownField)).rejects.toThrow(
      '格式或路径无效',
    );

    const escapingPath = await createTemplate({
      gameResourceDirectory: '../game',
    });
    await expect(loadStandalonePlayerTemplate(escapingPath)).rejects.toThrow(
      '格式或路径无效',
    );

    const oldRuntimeContract = await createTemplate({
      runtimeCompatibility: '>=1 <6',
    });
    await expect(
      loadStandalonePlayerTemplate(oldRuntimeContract),
    ).rejects.toThrow('格式或路径无效');
  });

  it('rejects every drift from the fixed macOS v1 injection paths', async () => {
    const fixedMacManifest = {
      platform: 'darwin',
      arch: 'arm64',
      payloadRoot: 'payload',
      artifactEntry: 'VN Engine Player.app',
      gameResourceDirectory: 'Contents/Resources/game',
      applicationMetadataFile:
        'Contents/Resources/vn-game-application.json',
      macosInfoPlistFile: 'Contents/Info.plist',
    };
    for (const drift of [
      { payloadRoot: 'player-payload' },
      { artifactEntry: 'Player.app' },
      { gameResourceDirectory: 'Contents/Other/game' },
      {
        applicationMetadataFile:
          'Contents/Other/vn-game-application.json',
      },
      { macosInfoPlistFile: 'Contents/Resources/Info.plist' },
    ]) {
      const root = await createTemplate({ ...fixedMacManifest, ...drift });
      await expect(
        loadStandalonePlayerTemplate(root, 'darwin', 'arm64'),
      ).rejects.toThrow('v1 exact 契约');
    }
  });

  it('rejects a template built for another platform or architecture', async () => {
    const otherPlatform = process.platform === 'darwin' ? 'linux' : 'darwin';
    const root = await createTemplate({
      platform: otherPlatform,
      artifactEntry:
        otherPlatform === 'darwin' ? 'VN Engine Player.app' : 'player',
      gameResourceDirectory:
        otherPlatform === 'darwin'
          ? 'Contents/Resources/game'
          : 'resources/game',
      applicationMetadataFile:
        otherPlatform === 'darwin'
          ? 'Contents/Resources/vn-game-application.json'
          : 'resources/vn-game-application.json',
      macosInfoPlistFile:
        otherPlatform === 'darwin' ? 'Contents/Info.plist' : null,
    });

    await expect(loadStandalonePlayerTemplate(root)).rejects.toThrow(
      '平台或架构不匹配',
    );
  });

  it('resolves only a Main-owned environment override', () => {
    expect(
      resolveStandalonePlayerTemplateRoot(
        '/resources',
        'darwin',
        'arm64',
        { VN_PLAYER_TEMPLATE_ROOT: '/private/templates/current' },
        { isPackaged: false, appPath: '/workspace/apps/editor' },
      ),
    ).toBe(path.resolve('/private/templates/current'));
    expect(
      resolveStandalonePlayerTemplateRoot('/resources', 'darwin', 'arm64', {}),
    ).toBe(path.join('/resources', 'player-templates', 'darwin-arm64'));
    expect(
      resolveStandalonePlayerTemplateRoot(
        '/electron/Resources',
        'darwin',
        'arm64',
        {},
        {
          isPackaged: false,
          appPath: '/workspace/My_Game_Engine/apps/editor',
        },
      ),
    ).toBe(path.resolve(
      '/workspace/My_Game_Engine/apps/editor',
      '..',
      '..',
      'engine',
      'stage',
      'player-templates',
      'darwin-arm64',
    ));
    expect(() =>
      resolveStandalonePlayerTemplateRoot(
        '/Applications/VN Engine Editor.app/Contents/Resources',
        'darwin',
        'arm64',
        { VN_PLAYER_TEMPLATE_ROOT: '/tmp/untrusted-template' },
        { isPackaged: true, appPath: '/Applications/VN Engine Editor.app' },
      ),
    ).toThrow('封装后的 Editor 不允许覆盖');
  });
});
