import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { GameRuntimeSnapshot } from '@vnengine/runtime';

import { PLAYER_IPC_CHANNEL, type VnPlayerApi } from '../../src/shared/playerProtocol';

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: { invoke: electronMocks.invoke },
}));

describe('Player Preload API', () => {
  let api: VnPlayerApi;

  beforeAll(async () => {
    await import('../../src/preload');
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      'vnPlayer',
      expect.any(Object),
    );
    api = electronMocks.exposeInMainWorld.mock.calls[0][1] as VnPlayerApi;
  });

  it('exposes only loading, media, save and trusted quit intents', () => {
    expect(Object.keys(api).sort()).toEqual([
      'getMediaUrl',
      'getSettings',
      'listSaveSlots',
      'loadGame',
      'loadGameSlot',
      'openGame',
      'quickLoad',
      'quickSave',
      'quitGame',
      'saveGame',
      'updateSettings',
    ]);
    expect('saveProject' in api).toBe(false);
    expect('importAsset' in api).toBe(false);
    expect('openPath' in api).toBe(false);
  });

  it('sends only typed intents, Asset IDs and canonical snapshots across IPC', async () => {
    const snapshot: GameRuntimeSnapshot = {
      snapshotVersion: 1,
      status: 'finished',
      sceneId: 'scene-1',
      nextNodeIndex: 0,
      bgmAssetId: null,
      bgmSequence: 0,
      dialogueSequence: 0,
      videoSequence: 0,
    };
    electronMocks.invoke.mockResolvedValueOnce({
      status: 'empty',
      mode: 'generic',
    });
    await api.loadGame();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'load-game', params: {} },
    );

    electronMocks.invoke.mockResolvedValueOnce({ status: 'canceled' });
    await api.openGame();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'open-game', params: {} },
    );

    electronMocks.invoke.mockResolvedValueOnce('vn-game-asset://image/a/b');
    await api.getMediaUrl('asset-1');
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'get-media-url', params: { assetId: 'asset-1' } },
    );

    electronMocks.invoke.mockResolvedValueOnce({ status: 'ready', slots: [] });
    await api.listSaveSlots();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'list-save-slots', params: {} },
    );

    electronMocks.invoke.mockResolvedValueOnce({
      status: 'saved',
      slot: {
        slotId: 2,
        savedAt: '2026-08-24T06:00:00.000Z',
        sceneName: 'Scene',
        summary: '剧情结束',
      },
    });
    await api.saveGame(2, snapshot);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'save-game', params: { slotId: 2, snapshot } },
    );

    electronMocks.invoke.mockResolvedValueOnce({ status: 'empty' });
    await api.loadGameSlot(2);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'load-game-slot', params: { slotId: 2 } },
    );

    electronMocks.invoke.mockResolvedValueOnce({ status: 'saved' });
    await api.quickSave(snapshot);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'quick-save', params: { snapshot } },
    );

    electronMocks.invoke.mockResolvedValueOnce({ status: 'empty' });
    await api.quickLoad();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'quick-load', params: {} },
    );

    electronMocks.invoke.mockResolvedValueOnce({
      status: 'ready',
      settings: {
        settingsVersion: 1,
        masterVolume: 1,
        bgmVolume: 1,
        voiceVolume: 1,
        videoVolume: 1,
        windowMode: 'windowed',
        windowSizePreset: 'medium',
      },
    });
    await api.getSettings();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'get-settings', params: {} },
    );

    electronMocks.invoke.mockResolvedValueOnce({ status: 'updated' });
    await api.updateSettings({ masterVolume: 0.75 });
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      {
        action: 'update-settings',
        params: { patch: { masterVolume: 0.75 } },
      },
    );

    electronMocks.invoke.mockResolvedValueOnce(undefined);
    await api.quitGame();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      PLAYER_IPC_CHANNEL,
      { action: 'quit-game', params: {} },
    );
  });
});
