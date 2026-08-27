/** @vitest-environment jsdom */
/**
 * 主要作用：验证 Web Gateway 的加载、全屏、设置、存档与媒体能力。
 * 关键函数与实现：测试套件“Web Player gateway”、`MemoryDocuments`、`FakeFullscreenDocument`、`project`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */

import type { ProjectDocument } from '@vnengine/runtime';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAYER_SETTINGS } from '../../src/shared/playerProtocol';
import type { PlayerSettingsPatch } from '../../src/shared/playerProtocol';
import type { LoadedWebBundle } from '../../src/web/WebBundleLoader';
import { WebPlayerGateway } from '../../src/web/WebPlayerGateway';
import {
  WebPlayerStorage,
  type WebDocumentStore,
} from '../../src/web/WebStorage';

class MemoryDocuments implements WebDocumentStore {
  readonly values = new Map<string, unknown>();

  async get(key: string): Promise<unknown | undefined> {
    await Promise.resolve();
    return this.values.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    await Promise.resolve();
    this.values.set(key, structuredClone(value));
  }
}

class FakeFullscreenDocument extends EventTarget {
  fullscreenElement: object | null = null;
  readonly requestFullscreen = vi.fn(async () => {
    this.fullscreenElement = this.documentElement;
    this.dispatchEvent(new Event('fullscreenchange'));
  });
  readonly documentElement = {
    requestFullscreen: this.requestFullscreen,
  };
  readonly exitFullscreen = vi.fn(async () => {
    this.fullscreenElement = null;
    this.dispatchEvent(new Event('fullscreenchange'));
  });
}

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'web-gateway-project',
  name: 'Web gateway',
  entrySceneId: 'scene',
  startScreen: {
    title: 'Web gateway',
    backgroundAssetId: 'background',
    musicAssetId: null,
  },
  cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  scenes: [{
    schemaVersion: 1,
    id: 'scene',
    name: 'Scene',
    backgroundAssetId: null,
    nodes: [],
  }],
};

const bundle: LoadedWebBundle = {
  game: {
    project,
    assets: [{ id: 'background', type: 'image', displayName: 'Background' }],
  },
  gameRoot: 'game/build-1',
  identity: {
    projectId: project.id,
    runtimeVersion: 6,
    contentFingerprint: 'a'.repeat(64),
  },
  assetUrls: new Map([
    ['background', 'https://example.test/game/build-1/assets/images/bg.png'],
  ]),
};

describe('Web Player gateway', () => {
  it('loads one embedded game, resolves only declared media, and reloads on quit', async () => {
    const reload = vi.fn();
    const loadBundle = vi.fn(async () => bundle);
    const gateway = new WebPlayerGateway({
      loadBundle,
      storage: new WebPlayerStorage(new MemoryDocuments()),
      reload,
      fullscreenDocument: null,
    });

    await expect(gateway.loadGame()).resolves.toEqual({
      status: 'loaded',
      mode: 'embedded',
      game: bundle.game,
    });
    await expect(gateway.loadGame()).resolves.toMatchObject({ status: 'loaded' });
    expect(loadBundle).toHaveBeenCalledTimes(1);
    await expect(gateway.openGame()).resolves.toEqual({
      status: 'rejected',
      error: 'web-open-disabled',
    });
    await expect(gateway.resolveMediaUrl('background')).resolves.toContain(
      '/game/build-1/assets/images/bg.png',
    );
    await expect(gateway.resolveMediaUrl('missing')).resolves.toBeNull();
    await gateway.quit();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('normalizes loader failures and unloaded operations to stable codes', async () => {
    const loadBundle = vi.fn().mockRejectedValue(
      new Error('/private/server/manifest.json leaked detail'),
    );
    const gateway = new WebPlayerGateway({
      loadBundle,
      storage: new WebPlayerStorage(new MemoryDocuments()),
      fullscreenDocument: null,
    });

    await expect(gateway.loadGame()).resolves.toEqual({
      status: 'error',
      mode: 'embedded',
      error: 'bundle-load-failed',
    });
    await expect(gateway.listSaveSlots()).resolves.toEqual({
      status: 'rejected',
      error: 'web-game-not-loaded',
    });
    await expect(gateway.quickLoad()).resolves.toEqual({
      status: 'rejected',
      error: 'web-game-not-loaded',
    });
    expect(JSON.stringify(await gateway.loadGame())).not.toContain('/private');
  });

  it('rejects malformed settings patches with a stable code', async () => {
    const gateway = new WebPlayerGateway({
      loadBundle: async () => bundle,
      storage: new WebPlayerStorage(new MemoryDocuments()),
      fullscreenDocument: null,
    });
    await expect(gateway.updateSettings({
      language: 'fr-FR',
    } as unknown as PlayerSettingsPatch)).resolves.toEqual({
      status: 'rejected',
      error: 'settings-invalid',
    });
  });

  it('keeps concurrent setting patches serialized without losing fields', async () => {
    const documents = new MemoryDocuments();
    const gateway = new WebPlayerGateway({
      loadBundle: async () => bundle,
      storage: new WebPlayerStorage(documents),
      fullscreenDocument: null,
    });

    await Promise.all([
      gateway.updateSettings({ masterVolume: 0.3 }),
      gateway.updateSettings({ bgmVolume: 0.4 }),
      gateway.updateSettings({ language: 'en-US' }),
    ]);
    await expect(gateway.getSettings()).resolves.toMatchObject({
      status: 'ready',
      settings: {
        masterVolume: 0.3,
        bgmVolume: 0.4,
        language: 'en-US',
      },
    });
  });

  it('uses Fullscreen API while leaving browser window sizing disabled', async () => {
    const fullscreen = new FakeFullscreenDocument();
    const gateway = new WebPlayerGateway({
      loadBundle: async () => bundle,
      storage: new WebPlayerStorage(new MemoryDocuments()),
      fullscreenDocument: fullscreen as unknown as Document,
    });
    expect(gateway.fullscreenControlsEnabled).toBe(true);
    expect(gateway.windowSizeControlsEnabled).toBe(false);

    await expect(gateway.updateSettings({ windowMode: 'fullscreen' })).resolves
      .toMatchObject({ status: 'updated', settings: { windowMode: 'fullscreen' } });
    expect(fullscreen.requestFullscreen).toHaveBeenCalledOnce();
    await expect(gateway.updateSettings({ windowMode: 'windowed' })).resolves
      .toMatchObject({ status: 'updated', settings: { windowMode: 'windowed' } });
    expect(fullscreen.exitFullscreen).toHaveBeenCalledOnce();
    gateway.dispose();
  });

  it('returns a stable error when fullscreen permission is denied', async () => {
    const fullscreen = new FakeFullscreenDocument();
    fullscreen.requestFullscreen.mockRejectedValueOnce(new Error('/private/denied'));
    const storage = new WebPlayerStorage(new MemoryDocuments());
    const gateway = new WebPlayerGateway({
      loadBundle: async () => bundle,
      storage,
      fullscreenDocument: fullscreen as unknown as Document,
    });

    await expect(gateway.updateSettings({ windowMode: 'fullscreen' })).resolves
      .toEqual({
        status: 'rejected',
        error: 'fullscreen-denied',
      });
    await expect(storage.readSettings()).resolves.toEqual({
      status: 'ready',
      settings: DEFAULT_PLAYER_SETTINGS,
    });
    gateway.dispose();
  });
});
