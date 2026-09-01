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
  readonly putManyCalls: Array<Array<{ key: string; value: unknown }>> = [];

  async get(key: string): Promise<unknown | undefined> {
    return this.values.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async putMany(records: readonly { key: string; value: unknown }[]): Promise<void> {
    const copies = records.map(({ key, value }) => ({
      key,
      value: structuredClone(value),
    }));
    this.putManyCalls.push(copies);
    for (const { key, value } of copies) {
      this.values.set(key, value);
    }
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
    backgroundScalePercent: 100,
    nodes: [{
      id: 'dialogue-1',
      type: 'dialogue',
      speaker: 'Alice',
      text: 'Saved in IndexedDB',
      voiceAssetId: null,
    }],
  }],
};

function active(
  fingerprint = 'a'.repeat(64),
  defaultLanguage: WebStorageGame['game']['defaultLanguage'] = 'zh-CN',
  projectId = project.id,
): WebStorageGame {
  const activeProject = projectId === project.id
    ? project
    : { ...project, id: projectId };
  return {
    game: { defaultLanguage, project: activeProject, assets: [] },
    identity: {
      projectId,
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

  it('loads a strict snapshot v4 save with legacy 100% image scales', async () => {
    const documents = new MemoryDocuments();
    const storage = new WebPlayerStorage(documents);
    const activeGame = active();
    const runtime = startGame(project)!;
    const current = createGameRuntimeSnapshot(project, runtime)!;
    const snapshotV4 = {
      snapshotVersion: 4,
      status: current.status,
      sceneId: current.sceneId,
      nextNodeIndex: current.nextNodeIndex,
      backgroundAssetId: current.backgroundAssetId,
      bgmAssetId: current.bgmAssetId,
      bgmSequence: current.bgmSequence,
      dialogueSequence: current.dialogueSequence,
      characterEffectSequence: current.characterEffectSequence,
      videoSequence: current.videoSequence,
      cgAssetId: current.cgAssetId,
      cgLeadInMs: current.cgLeadInMs,
      cgSequence: current.cgSequence,
      characters: current.characters.map((character) => ({
        nodeId: character.nodeId,
        assetId: character.assetId,
        slot: character.slot,
        layer: character.layer,
        position: character.position,
        opacity: character.opacity,
        effectSequence: character.effectSequence,
      })),
      variables: current.variables,
      loopStack: current.loopStack,
    };
    const key = [
      'save-v1',
      activeGame.identity.projectId,
      String(activeGame.identity.runtimeVersion),
      activeGame.identity.contentFingerprint,
      '1',
    ].join('\0');
    documents.values.set(key, {
      format: 'vn-engine-player-save',
      saveVersion: 1,
      game: activeGame.identity,
      slotId: 1,
      savedAt: '2026-08-25T08:00:00.000Z',
      snapshot: snapshotV4,
    });

    await expect(storage.loadSave(activeGame, 1)).resolves.toEqual({
      status: 'loaded',
      runtime,
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

    await expect(storage.readSettings(active())).resolves.toEqual({
      status: 'ready',
      settings: DEFAULT_PLAYER_SETTINGS,
      languageSource: 'default',
    });
    await expect(storage.writeSettings(
      active(),
      {
        ...DEFAULT_PLAYER_SETTINGS,
        bgmVolume: 0.4,
      },
      false,
    )).resolves.toMatchObject({
      status: 'updated',
      settings: { bgmVolume: 0.4 },
    });
    await expect(storage.readSettings(active())).resolves.toMatchObject({
      status: 'ready',
      languageSource: 'default',
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

  it('treats an old unscoped v2 language as a default for a newly exported game', async () => {
    const documents = new MemoryDocuments();
    documents.values.set('settings-v2', {
      format: 'vn-engine-player-settings',
      settingsVersion: 2,
      settings: {
        language: 'zh-CN',
        masterVolume: 0.45,
        bgmVolume: 0.55,
        voiceVolume: 0.65,
        videoVolume: 0.75,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });
    const storage = new WebPlayerStorage(documents);

    await expect(storage.readSettings(
      active('b'.repeat(64), 'en-US'),
    )).resolves.toEqual({
      status: 'ready',
      languageSource: 'default',
      settings: {
        settingsVersion: 2,
        language: 'en-US',
        masterVolume: 0.45,
        bgmVolume: 0.55,
        voiceVolume: 0.65,
        videoVolume: 0.75,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
    });
  });

  it('keeps an explicit language override for the same project and bundle default', async () => {
    const documents = new MemoryDocuments();
    const storage = new WebPlayerStorage(documents);
    const englishGame = active('a'.repeat(64), 'en-US');
    const chineseOverride = {
      ...DEFAULT_PLAYER_SETTINGS,
      language: 'zh-CN' as const,
      masterVolume: 0.6,
    };

    await expect(storage.writeSettings(
      englishGame,
      chineseOverride,
      true,
    )).resolves.toMatchObject({
      status: 'updated',
      settings: { language: 'zh-CN', masterVolume: 0.6 },
    });
    expect(documents.putManyCalls.at(-1)?.map(({ key }) => key)).toEqual([
      'settings-v2',
      `language-v1\0${project.id}\0en-US`,
    ]);
    await expect(storage.readSettings(
      active('b'.repeat(64), 'en-US'),
    )).resolves.toMatchObject({
      status: 'ready',
      languageSource: 'stored',
      settings: { language: 'zh-CN', masterVolume: 0.6 },
    });
    await expect(storage.readSettings(
      active('c'.repeat(64), 'en-US', 'another-project'),
    )).resolves.toMatchObject({
      status: 'ready',
      languageSource: 'default',
      settings: { language: 'en-US', masterVolume: 0.6 },
    });
    await expect(storage.readSettings(
      active('d'.repeat(64), 'zh-CN'),
    )).resolves.toMatchObject({
      status: 'ready',
      languageSource: 'default',
      settings: { language: 'zh-CN', masterVolume: 0.6 },
    });
  });

  it('does not turn a volume-only write into a cross-bundle language override', async () => {
    const documents = new MemoryDocuments();
    const storage = new WebPlayerStorage(documents);

    await expect(storage.writeSettings(
      active('a'.repeat(64), 'zh-CN'),
      {
        ...DEFAULT_PLAYER_SETTINGS,
        language: 'zh-CN',
        masterVolume: 0.35,
      },
      false,
    )).resolves.toMatchObject({
      status: 'updated',
      settings: { language: 'zh-CN', masterVolume: 0.35 },
    });
    await expect(storage.readSettings(
      active('b'.repeat(64), 'en-US'),
    )).resolves.toMatchObject({
      status: 'ready',
      languageSource: 'default',
      settings: { language: 'en-US', masterVolume: 0.35 },
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

    await expect(storage.readSettings(active())).resolves.toEqual({
      status: 'ready',
      languageSource: 'default',
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
    await storage.writeSettings(
      active(),
      {
        settingsVersion: 2,
        language: 'en-US',
        masterVolume: 0.8,
        bgmVolume: 0.7,
        voiceVolume: 0.6,
        videoVolume: 0.5,
        windowMode: 'windowed',
        windowSizePreset: 'large',
      },
      true,
    );
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

  it('prefers current v2 values over stale v1 while deriving its language from the game', async () => {
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

    await expect(new WebPlayerStorage(documents).readSettings(
      active('a'.repeat(64), 'zh-CN'),
    )).resolves
      .toMatchObject({
        status: 'ready',
        languageSource: 'default',
        settings: {
          settingsVersion: 2,
          language: 'zh-CN',
          masterVolume: 0.9,
          windowSizePreset: 'large',
        },
      });
  });

  it('reports an IndexedDB operation failure without exposing internals', async () => {
    const failing: WebDocumentStore = {
      get: async () => { throw new Error('/private/database'); },
      put: async () => { throw new Error('/private/database'); },
      putMany: async () => { throw new Error('/private/database'); },
    };
    const storage = new WebPlayerStorage(failing);
    await expect(storage.readSettings(active())).resolves.toEqual({
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
