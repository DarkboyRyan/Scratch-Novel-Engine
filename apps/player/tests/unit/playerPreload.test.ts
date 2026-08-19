import { beforeAll, describe, expect, it, vi } from 'vitest';

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

  it('exposes only loadGame, openGame and getMediaUrl', () => {
    expect(Object.keys(api).sort()).toEqual([
      'getMediaUrl',
      'loadGame',
      'openGame',
    ]);
    expect('saveProject' in api).toBe(false);
    expect('importAsset' in api).toBe(false);
    expect('openPath' in api).toBe(false);
  });

  it('sends only typed intent and Asset ID across IPC', async () => {
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
  });
});
