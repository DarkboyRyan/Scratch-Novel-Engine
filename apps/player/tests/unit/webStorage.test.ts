/**
 * 主要作用：验证 Web 存储隔离、槽位、游戏指纹与设置持久化。
 * 关键函数与实现：测试套件“Web Player storage”、`MemoryDocuments`、`project`、`active`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import {
  createGameRuntimeSnapshot,
  startGame,
  type ProjectDocument,
} from '@vnengine/runtime';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PLAYER_SETTINGS } from '../../src/shared/playerProtocol';
import {
  WebPlayerStorage,
  type WebDocumentStore,
  type WebStorageGame,
} from '../../src/web/WebStorage';

class MemoryDocuments implements WebDocumentStore {
  readonly values = new Map<string, unknown>();

  async get(key: string): Promise<unknown | undefined> {
    return this.values.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
}

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'web-storage-project',
  name: 'Web saves',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Web saves',
    eyebrow: 'A VN ENGINE STORY',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  scenes: [{
    schemaVersion: 1,
    id: 'scene-1',
    name: 'First scene',
    backgroundAssetId: null,
    nodes: [{
      id: 'dialogue-1',
      type: 'dialogue',
      speaker: 'Alice',
      text: 'Saved in IndexedDB',
      voiceAssetId: null,
    }],
  }],
};

function active(fingerprint = 'a'.repeat(64)): WebStorageGame {
  return {
    game: { project, assets: [] },
    identity: {
      projectId: project.id,
      runtimeVersion: 6,
      contentFingerprint: fingerprint,
    },
  };
}

describe('Web Player storage', () => {
  it('round-trips canonical manual and quick saves per content fingerprint', async () => {
    const documents = new MemoryDocuments();
    const storage = new WebPlayerStorage(
      documents,
      () => new Date('2026-08-25T08:00:00.000Z'),
    );
    const runtime = startGame(project)!;
    const snapshot = createGameRuntimeSnapshot(project, runtime)!;

    await expect(storage.writeSave(active(), 1, snapshot)).resolves.toMatchObject({
      status: 'saved',
      slot: {
        slotId: 1,
        sceneName: 'First scene',
        summary: {
          kind: 'dialogue',
          speaker: 'Alice',
          text: 'Saved in IndexedDB',
        },
      },
    });
    await expect(storage.writeSave(active(), 'quick', snapshot)).resolves
      .toMatchObject({ status: 'saved', slot: { slotId: 'quick' } });
    await expect(storage.listSaveSlots(active())).resolves.toMatchObject({
      status: 'ready',
      slots: [{ slotId: 1 }, { slotId: 'quick' }],
    });
    await expect(storage.loadSave(active(), 1)).resolves.toEqual({
      status: 'loaded',
      runtime,
    });
    await expect(storage.loadSave(active('b'.repeat(64)), 1)).resolves.toEqual({
      status: 'empty',
    });

    const manualKey = [...documents.values.keys()].find(
      (key) => key.startsWith('save-v1\0') && key.split('\0').at(-1) === '1',
    );
    expect(manualKey).toBeDefined();
    documents.values.set(manualKey!, { privatePath: '/private/save' });
    await expect(storage.loadSave(active(), 1)).resolves.toEqual({
      status: 'rejected',
      error: 'save-incompatible',
    });
  });

  it('rejects forged snapshots without publishing them', async () => {
    const documents = new MemoryDocuments();
    const storage = new WebPlayerStorage(documents);
    const snapshot = createGameRuntimeSnapshot(project, startGame(project)!)!;
    await expect(storage.writeSave(active(), 2, {
      ...snapshot,
      nextNodeIndex: snapshot.nextNodeIndex - 1,
    })).resolves.toEqual({
      status: 'rejected',
      error: 'runtime-not-saveable',
    });
    expect(documents.values.size).toBe(0);
  });

  it('recovers malformed settings to defaults and allows replacement', async () => {
    const documents = new MemoryDocuments();
    documents.values.set('settings-v1', { privatePath: '/private/settings' });
    const storage = new WebPlayerStorage(documents);

    await expect(storage.readSettings()).resolves.toEqual({
      status: 'ready',
      settings: DEFAULT_PLAYER_SETTINGS,
    });
    await expect(storage.writeSettings({
      ...DEFAULT_PLAYER_SETTINGS,
      bgmVolume: 0.4,
    })).resolves.toMatchObject({
      status: 'updated',
      settings: { bgmVolume: 0.4 },
    });
    await expect(storage.readSettings()).resolves.toMatchObject({
      status: 'ready',
      settings: { bgmVolume: 0.4 },
    });
    expect(documents.values.get('settings-v2')).toEqual({
      format: 'vn-engine-player-settings',
      settingsVersion: 2,
      settings: {
        language: 'zh-CN',
        masterVolume: 1,
        bgmVolume: 0.4,
        voiceVolume: 1,
        videoVolume: 1,
        windowMode: 'windowed',
        windowSizePreset: 'medium',
      },
    });
  });

  it('strictly migrates exact v1 settings and writes only exact v2', async () => {
    const documents = new MemoryDocuments();
    documents.values.set('settings-v1', {
      format: 'vn-engine-player-settings',
      settingsVersion: 1,
      settings: {
        masterVolume: 0.8,
        bgmVolume: 0.7,
        voiceVolume: 0.6,
        videoVolume: 0.5,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });
    const storage = new WebPlayerStorage(documents);

    await expect(storage.readSettings()).resolves.toEqual({
      status: 'ready',
      settings: {
        settingsVersion: 2,
        language: 'zh-CN',
        masterVolume: 0.8,
        bgmVolume: 0.7,
        voiceVolume: 0.6,
        videoVolume: 0.5,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });
    await storage.writeSettings({
      settingsVersion: 2,
      language: 'en-US',
      masterVolume: 0.8,
      bgmVolume: 0.7,
      voiceVolume: 0.6,
      videoVolume: 0.5,
      windowMode: 'windowed',
      windowSizePreset: 'large',
    });
    expect(documents.values.get('settings-v2')).toEqual({
      format: 'vn-engine-player-settings',
      settingsVersion: 2,
      settings: {
        language: 'en-US',
        masterVolume: 0.8,
        bgmVolume: 0.7,
        voiceVolume: 0.6,
        videoVolume: 0.5,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });
    expect(documents.values.get('settings-v1')).toEqual({
      format: 'vn-engine-player-settings',
      settingsVersion: 1,
      settings: {
        masterVolume: 0.8,
        bgmVolume: 0.7,
        voiceVolume: 0.6,
        videoVolume: 0.5,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });
  });

  it('prefers current v2 settings over a stale legacy v1 record', async () => {
    const documents = new MemoryDocuments();
    documents.values.set('settings-v1', {
      format: 'vn-engine-player-settings',
      settingsVersion: 1,
      settings: {
        masterVolume: 0.2,
        bgmVolume: 0.2,
        voiceVolume: 0.2,
        videoVolume: 0.2,
        windowMode: 'windowed',
        windowSizePreset: 'small',
      },
    });
    documents.values.set('settings-v2', {
      format: 'vn-engine-player-settings',
      settingsVersion: 2,
      settings: {
        language: 'en-US',
        masterVolume: 0.9,
        bgmVolume: 0.8,
        voiceVolume: 0.7,
        videoVolume: 0.6,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });

    await expect(new WebPlayerStorage(documents).readSettings()).resolves
      .toMatchObject({
        status: 'ready',
        settings: {
          settingsVersion: 2,
          language: 'en-US',
          masterVolume: 0.9,
          windowSizePreset: 'large',
        },
      });
  });

  it('reports an IndexedDB operation failure without exposing internals', async () => {
    const failing: WebDocumentStore = {
      get: async () => { throw new Error('/private/database'); },
      put: async () => { throw new Error('/private/database'); },
    };
    const storage = new WebPlayerStorage(failing);
    await expect(storage.readSettings()).resolves.toEqual({
      status: 'rejected',
      error: 'settings-storage-unavailable',
    });
    await expect(storage.listSaveSlots(active())).resolves.toEqual({
      status: 'rejected',
      error: 'save-storage-unavailable',
    });
    await expect(storage.loadSave(active(), 1)).resolves.toEqual({
      status: 'rejected',
      error: 'save-storage-unavailable',
    });
  });
});
