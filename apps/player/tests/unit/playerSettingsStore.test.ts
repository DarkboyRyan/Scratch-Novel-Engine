import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayerSettingsStore } from '../../src/main/settings/PlayerSettingsStore';
import { DEFAULT_PLAYER_SETTINGS } from '../../src/shared/playerProtocol';

const temporaryDirectories: string[] = [];

async function makeStore(reportError = vi.fn()) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'vn-player-settings-'));
  temporaryDirectories.push(temporaryRoot);
  const root = path.join(temporaryRoot, 'settings');
  return {
    root,
    reportError,
    store: new PlayerSettingsStore(root, reportError),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Player settings storage', () => {
  it('uses immutable defaults when missing and atomically round-trips v2', async () => {
    const { root, store } = await makeStore();
    const defaults = await store.load();
    expect(defaults).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(defaults).not.toBe(DEFAULT_PLAYER_SETTINGS);

    const settings = {
      ...defaults,
      masterVolume: 0.75,
      bgmVolume: 0.5,
      voiceVolume: 0.25,
      videoVolume: 0,
      windowMode: 'fullscreen' as const,
      windowSizePreset: 'large' as const,
    };
    await expect(store.write(settings)).resolves.toEqual(settings);
    await expect(store.load()).resolves.toEqual(settings);

    const document = JSON.parse(
      await readFile(path.join(root, 'settings.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(document).toEqual({
      format: 'vn-engine-player-settings',
      settingsVersion: 2,
      settings: {
        language: 'zh-CN',
        masterVolume: 0.75,
        bgmVolume: 0.5,
        voiceVolume: 0.25,
        videoVolume: 0,
        windowMode: 'fullscreen',
        windowSizePreset: 'large',
      },
    });
    expect(JSON.stringify(document)).not.toContain(root);
  });

  it('strictly migrates an exact v1 document to Chinese and writes only v2', async () => {
    const { root, reportError, store } = await makeStore();
    await store.write({ ...DEFAULT_PLAYER_SETTINGS });
    await writeFile(path.join(root, 'settings.json'), JSON.stringify({
      format: 'vn-engine-player-settings',
      settingsVersion: 1,
      settings: {
        masterVolume: 0.7,
        bgmVolume: 0.6,
        voiceVolume: 0.5,
        videoVolume: 0.4,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    }));

    const migrated = await store.load();
    expect(migrated).toEqual({
      settingsVersion: 2,
      language: 'zh-CN',
      masterVolume: 0.7,
      bgmVolume: 0.6,
      voiceVolume: 0.5,
      videoVolume: 0.4,
      windowMode: 'windowed',
      windowSizePreset: 'large',
    });
    expect(reportError).not.toHaveBeenCalled();

    await store.write(migrated);
    const rewritten = JSON.parse(
      await readFile(path.join(root, 'settings.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(rewritten).toEqual({
      format: 'vn-engine-player-settings',
      settingsVersion: 2,
      settings: {
        language: 'zh-CN',
        masterVolume: 0.7,
        bgmVolume: 0.6,
        voiceVolume: 0.5,
        videoVolume: 0.4,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });
  });

  it('fails closed to defaults for malformed, future, and non-exact documents', async () => {
    const { root, reportError, store } = await makeStore();
    await store.write({ ...DEFAULT_PLAYER_SETTINGS });
    const filePath = path.join(root, 'settings.json');
    const invalidDocuments = [
      '{broken',
      JSON.stringify({
        format: 'vn-engine-player-settings',
        settingsVersion: 3,
        settings: {
          language: 'zh-CN',
          masterVolume: 1,
          bgmVolume: 1,
          voiceVolume: 1,
          videoVolume: 1,
          windowMode: 'windowed',
          windowSizePreset: 'medium',
        },
      }),
      JSON.stringify({
        format: 'vn-engine-player-settings',
        settingsVersion: 2,
        settings: {
          masterVolume: 1,
          bgmVolume: 1,
          voiceVolume: 1,
          videoVolume: 1,
          windowMode: 'windowed',
          windowSizePreset: 'medium',
        },
      }),
      JSON.stringify({
        format: 'vn-engine-player-settings',
        settingsVersion: 1,
        settings: {
          language: 'zh-CN',
          masterVolume: 1,
          bgmVolume: 1,
          voiceVolume: 1,
          videoVolume: 1,
          windowMode: 'windowed',
          windowSizePreset: 'medium',
        },
      }),
      JSON.stringify({
        format: 'vn-engine-player-settings',
        settingsVersion: 2,
        settings: {
          language: 'zh-CN',
          masterVolume: 1,
          bgmVolume: 1,
          voiceVolume: 1,
          videoVolume: 1,
          windowMode: 'windowed',
          windowSizePreset: 'medium',
          settingsVersion: 2,
        },
      }),
      JSON.stringify({
        format: 'vn-engine-player-settings',
        settingsVersion: 2,
        settings: {
          language: 'zh-CN',
          masterVolume: Number.NaN,
          bgmVolume: 1,
          voiceVolume: 1,
          videoVolume: 1,
          windowMode: 'windowed',
          windowSizePreset: 'medium',
        },
      }),
    ];

    for (const document of invalidDocuments) {
      await writeFile(filePath, document);
      await expect(store.load()).resolves.toEqual(DEFAULT_PLAYER_SETTINGS);
    }
    expect(reportError).toHaveBeenCalled();
  });

  it('recovers the last complete backup after a corrupt primary', async () => {
    const { root, store } = await makeStore();
    const first = { ...DEFAULT_PLAYER_SETTINGS, bgmVolume: 0.4 };
    const second = { ...DEFAULT_PLAYER_SETTINGS, bgmVolume: 0.8 };
    await store.write(first);
    await store.write(second);
    await writeFile(path.join(root, 'settings.json'), '{incomplete');

    await expect(store.load()).resolves.toEqual(first);
  });

  it('never follows a symlinked settings file or settings directory', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const first = await makeStore();
    await first.store.write({ ...DEFAULT_PLAYER_SETTINGS });
    const outsideFile = path.join(path.dirname(first.root), 'outside.json');
    await writeFile(outsideFile, '{"private":true}');
    await rm(path.join(first.root, 'settings.json'));
    await symlink(outsideFile, path.join(first.root, 'settings.json'));
    await expect(first.store.load()).resolves.toEqual(DEFAULT_PLAYER_SETTINGS);
    await expect(first.store.write({
      ...DEFAULT_PLAYER_SETTINGS,
      masterVolume: 0.5,
    })).rejects.toThrow();
    expect(await readFile(outsideFile, 'utf8')).toBe('{"private":true}');

    const second = await makeStore();
    const redirected = path.join(path.dirname(second.root), 'redirected');
    await symlink(redirected, second.root, 'dir');
    await expect(second.store.load()).resolves.toEqual(DEFAULT_PLAYER_SETTINGS);
    await expect(second.store.write({
      ...DEFAULT_PLAYER_SETTINGS,
      masterVolume: 0.5,
    })).rejects.toThrow();
  });

  it('rejects non-normalized and relative storage roots', () => {
    expect(() => new PlayerSettingsStore('settings')).toThrow('normalized absolute');
    expect(() => new PlayerSettingsStore('/tmp/a/../b')).toThrow(
      'normalized absolute',
    );
  });
});
