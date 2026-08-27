/**
 * 主要作用：验证 Player 构建环境、路径、标识符与嵌入资源约束。
 * 关键函数与实现：测试套件“Player build configuration”、`temporaryDirectories`、`temporaryRoot`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import {
  cp,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PLAYER_BUILD_ENV,
  resolveCopiedEmbeddedGameRoot,
  resolvePlayerBuildConfig,
  verifyCopiedEmbeddedGame,
} from '../../src/main/build/playerBuildConfig';

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-player-build-'));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Player build configuration', () => {
  it('preserves the generic Player defaults without an embedded resource', () => {
    expect(resolvePlayerBuildConfig({})).toEqual({
      productName: 'VN Engine Player',
      version: '0.1.0',
      appBundleId: 'com.vnengine.player',
      iconPath: null,
      embeddedGameDirectory: null,
      outDir: 'out',
    });
  });

  it('accepts fully specified, canonical embedded build metadata', async () => {
    const root = await temporaryRoot();
    const game = path.join(root, 'game');
    const icon = path.join(root, 'vn-player-icon.png');
    const output = path.join(root, 'out');
    await mkdir(game);
    await writeFile(icon, 'icon');
    const canonicalGame = await realpath(game);
    const canonicalIcon = await realpath(icon);

    expect(resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: '星光物语',
      [PLAYER_BUILD_ENV.version]: '1.2.3',
      [PLAYER_BUILD_ENV.appBundleId]: 'com.example.starlight',
      [PLAYER_BUILD_ENV.iconPath]: icon,
      [PLAYER_BUILD_ENV.embeddedGameDirectory]: game,
      [PLAYER_BUILD_ENV.outDir]: output,
    })).toEqual({
      productName: '星光物语',
      version: '1.2.3',
      appBundleId: 'com.example.starlight',
      iconPath: canonicalIcon,
      embeddedGameDirectory: canonicalGame,
      outDir: output,
    });
  });

  it('rejects incomplete metadata, unsafe names, relative paths and symlinks', async () => {
    const root = await temporaryRoot();
    const game = path.join(root, 'game');
    const linkedGame = path.join(root, 'linked-game');
    await mkdir(game);
    await symlink(game, linkedGame);

    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.embeddedGameDirectory]: game,
    })).toThrow('必须同时提供');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: '../unsafe',
    })).toThrow('安全的应用名称');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: 'Cafe\u0301',
    })).toThrow('安全的应用名称');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: 'CON',
    })).toThrow('安全的应用名称');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: 'Story ',
    })).toThrow('首尾空白');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.outDir]: 'relative/out',
    })).toThrow('绝对路径');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.appBundleId]: 'example.story',
    })).toThrow('reverse-DNS ID');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.version]: `${'1'.repeat(30)}.1.1`,
    })).toThrow('x.y.z');
    expect(resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: '😀'.repeat(50),
    }).productName).toBe('😀'.repeat(50));
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: '😀'.repeat(51),
    })).toThrow('安全的应用名称');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: '-Game',
    })).toThrow('安全的应用名称');
    expect(resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.appBundleId]: 'com.example.2story',
    }).appBundleId).toBe('com.example.2story');
    expect(() => resolvePlayerBuildConfig({
      [PLAYER_BUILD_ENV.productName]: 'Story',
      [PLAYER_BUILD_ENV.version]: '1.0.0',
      [PLAYER_BUILD_ENV.appBundleId]: 'com.example.story',
      [PLAYER_BUILD_ENV.embeddedGameDirectory]: linkedGame,
    })).toThrow('非链接普通目录');
  });

  it('strictly validates the copied Resources/game before signing', async () => {
    const buildPath = await temporaryRoot();
    const productName = 'Build Test';
    const copiedGame = resolveCopiedEmbeddedGameRoot(
      buildPath,
      'darwin',
      productName,
    );
    const fixture = path.resolve(__dirname, '../../fixtures/game');
    await mkdir(path.dirname(copiedGame), { recursive: true });
    await cp(fixture, copiedGame, { recursive: true });

    await expect(
      verifyCopiedEmbeddedGame(buildPath, 'darwin', productName),
    ).resolves.toBeUndefined();

    await writeFile(path.join(copiedGame, 'manifest.json'), '{"broken":true}');
    await expect(
      verifyCopiedEmbeddedGame(buildPath, 'darwin', productName),
    ).rejects.toThrow();
  });
});
