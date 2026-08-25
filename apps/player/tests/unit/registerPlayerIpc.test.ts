import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameRuntimeSnapshot, startGame } from '@vnengine/runtime';

import { registerPlayerIpc } from '../../src/main/ipc/registerPlayerIpc';
import type { PlayerWindowContexts } from '../../src/main/window/PlayerWindowContext';
import { PLAYER_IPC_CHANNEL } from '../../src/shared/playerProtocol';

type RegisteredHandler = (
  event: Electron.IpcMainInvokeEvent,
  invocation: unknown,
) => unknown | Promise<unknown>;

function trustedEvent(): Electron.IpcMainInvokeEvent {
  const mainFrame = { url: 'file:///player/index.html' };
  const sender = { id: 42, mainFrame };
  return { sender, senderFrame: mainFrame } as Electron.IpcMainInvokeEvent;
}

describe('Player trusted IPC', () => {
  const handle = vi.fn();
  const getMediaUrl = vi.fn((assetId: string) =>
    assetId === 'image'
      ? 'vn-game-asset://image/generation/capability'
      : null,
  );
  const openGame = vi.fn().mockResolvedValue({ status: 'canceled' });
  const publicGame = {
    project: {
      schemaVersion: 1 as const,
      id: 'project',
      name: 'Game',
      entrySceneId: 'scene',
      startScreen: {
        title: 'Story Title',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
      scenes: [
        {
          schemaVersion: 1 as const,
          id: 'scene',
          name: 'Scene',
          backgroundAssetId: null,
          nodes: [],
        },
      ],
    },
    assets: [{ id: 'image', type: 'image' as const, displayName: 'Image' }],
  };

  function register(game: typeof publicGame | null = publicGame) {
    const quitPlayer = vi.fn();
    const loadGame = vi.fn(() => game === null
      ? {
          status: 'error' as const,
          mode: 'generic' as const,
          error: 'bundle-load-failed' as const,
        }
      : { status: 'loaded' as const, mode: 'generic' as const, game });
    const active = game === null ? null : {
      game,
      generation: 1,
      identity: {
        projectId: game.project.id,
        runtimeVersion: 6,
        contentFingerprint: 'a'.repeat(64),
      },
    };
    const getActiveGameContext = vi.fn(() => active);
    const isActiveGameContext = vi.fn((candidate) => candidate === active);
    const saveStore = {
      list: vi.fn().mockResolvedValue({ status: 'ready', slots: [] }),
      write: vi.fn().mockResolvedValue({
        status: 'saved',
        slot: {
          slotId: 1,
          savedAt: '2026-08-24T06:00:00.000Z',
          sceneName: 'Scene',
          summary: { kind: 'finished' },
        },
      }),
      load: vi.fn().mockResolvedValue({ status: 'empty' }),
    };
    const settingsController = {
      getSettings: vi.fn().mockResolvedValue({
        status: 'ready',
        settings: {
          settingsVersion: 2,
          language: 'zh-CN',
          masterVolume: 1,
          bgmVolume: 1,
          voiceVolume: 1,
          videoVolume: 1,
          windowMode: 'windowed',
          windowSizePreset: 'medium',
        },
      }),
      updateSettings: vi.fn().mockImplementation(async (patch) => ({
        status: 'updated',
        settings: {
          settingsVersion: 2,
          language: 'zh-CN',
          masterVolume: 1,
          bgmVolume: 1,
          voiceVolume: 1,
          videoVolume: 1,
          windowMode: 'windowed',
          windowSizePreset: 'medium',
          ...patch,
        },
      })),
    };
    const contexts = new Map([
      [
        42,
        {
          bundleSession: {
            loadGame,
            openGame,
            getMediaUrl,
            getActiveGameContext,
            isActiveGameContext,
          },
          saveStore,
          settingsController,
        },
      ],
    ]) as unknown as PlayerWindowContexts;
    registerPlayerIpc(
      { handle } as unknown as Electron.IpcMain,
      contexts,
      new Map([[42, 'file:///player/index.html']]),
      quitPlayer,
    );
    expect(handle).toHaveBeenCalledWith(
      PLAYER_IPC_CHANNEL,
      expect.any(Function),
    );
    return {
      handler: handle.mock.calls[0][1] as RegisteredHandler,
      quitPlayer,
      saveStore,
      settingsController,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only ProjectDocument and path-free Asset DTOs', () => {
    const { handler } = register();
    const result = handler(trustedEvent(), {
      action: 'load-game',
      params: {},
    });

    expect(result).toEqual({
      status: 'loaded',
      mode: 'generic',
      game: publicGame,
    });
    expect(JSON.stringify(result)).not.toContain('path');
    expect(JSON.stringify(result)).not.toContain('sha256');
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('exposes only opaque media capabilities for known Asset IDs', () => {
    const { handler } = register();
    expect(
      handler(trustedEvent(), {
        action: 'get-media-url',
        params: { assetId: 'image' },
      }),
    ).toBe('vn-game-asset://image/generation/capability');
    expect(
      handler(trustedEvent(), {
        action: 'get-media-url',
        params: { assetId: 'missing' },
      }),
    ).toBeNull();
    expect(getMediaUrl).toHaveBeenCalledTimes(2);
  });

  it('opens a game through a path-free Main-owned intent', async () => {
    const { handler } = register();
    await expect(
      handler(trustedEvent(), { action: 'open-game', params: {} }),
    ).resolves.toEqual({ status: 'canceled' });
    expect(openGame).toHaveBeenCalledOnce();
  });

  it('quits the application through an injected trusted Main action', () => {
    const { handler, quitPlayer } = register();
    expect(
      handler(trustedEvent(), { action: 'quit-game', params: {} }),
    ).toBeUndefined();
    expect(quitPlayer).toHaveBeenCalledOnce();
  });

  it('routes strict settings patches without requiring an active game', async () => {
    const { handler, settingsController } = register(null);
    await expect(handler(trustedEvent(), {
      action: 'get-settings',
      params: {},
    })).resolves.toMatchObject({
      status: 'ready',
      settings: {
        settingsVersion: 2,
        language: 'zh-CN',
        windowMode: 'windowed',
      },
    });
    await expect(handler(trustedEvent(), {
      action: 'update-settings',
      params: { patch: { bgmVolume: 0.25 } },
    })).resolves.toMatchObject({
      status: 'updated',
      settings: { bgmVolume: 0.25 },
    });
    expect(settingsController.updateSettings).toHaveBeenCalledWith({
      bgmVolume: 0.25,
    });

    await expect(handler(trustedEvent(), {
      action: 'update-settings',
      params: { patch: { language: 'en-US' } },
    })).resolves.toMatchObject({
      status: 'updated',
      settings: { language: 'en-US' },
    });
    expect(settingsController.updateSettings).toHaveBeenLastCalledWith({
      language: 'en-US',
    });
  });

  it('routes manual and quick saves through the active bundle context', async () => {
    const { handler, saveStore } = register();
    const runtime = startGame(publicGame.project)!;
    const snapshot = createGameRuntimeSnapshot(publicGame.project, runtime)!;

    await expect(handler(trustedEvent(), {
      action: 'list-save-slots',
      params: {},
    })).resolves.toEqual({ status: 'ready', slots: [] });
    await expect(handler(trustedEvent(), {
      action: 'save-game',
      params: { slotId: 2, snapshot },
    })).resolves.toMatchObject({ status: 'saved' });
    await expect(handler(trustedEvent(), {
      action: 'load-game-slot',
      params: { slotId: 2 },
    })).resolves.toEqual({ status: 'empty' });
    await expect(handler(trustedEvent(), {
      action: 'quick-save',
      params: { snapshot },
    })).resolves.toMatchObject({ status: 'saved' });
    await expect(handler(trustedEvent(), {
      action: 'quick-load',
      params: {},
    })).resolves.toEqual({ status: 'empty' });

    expect(saveStore.write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ generation: 1 }),
      2,
      snapshot,
      expect.any(Function),
    );
    expect(saveStore.write).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ generation: 1 }),
      'quick',
      snapshot,
      expect.any(Function),
    );
  });

  it('rejects save requests without an active game or a canonical snapshot', async () => {
    const empty = register(null);
    await expect(empty.handler(trustedEvent(), {
      action: 'list-save-slots',
      params: {},
    })).resolves.toEqual({
      status: 'rejected',
      error: 'no-active-game',
    });

    const { handler, saveStore } = register();
    const runtime = startGame(publicGame.project)!;
    const snapshot = createGameRuntimeSnapshot(publicGame.project, runtime)!;
    for (const invocation of [
      { action: 'save-game', params: { slotId: 4, snapshot } },
      {
        action: 'save-game',
        params: {
          slotId: 1,
          snapshot: { ...snapshot, privatePath: '/tmp/a' },
        },
      },
      {
        action: 'quick-save',
        params: { snapshot: { ...snapshot, snapshotVersion: 2 } },
      },
      {
        action: 'quick-save',
        params: { snapshot: { ...snapshot, sceneId: 's'.repeat(257) } },
      },
      { action: 'load-game-slot', params: { slotId: '1' } },
    ]) {
      expect(() => handler(trustedEvent(), invocation)).toThrow('格式无效');
    }
    expect(saveStore.write).not.toHaveBeenCalled();
  });

  it('rejects subframes, extra fields and any path-shaped request', () => {
    const { handler } = register();
    const event = trustedEvent();
    const subframe = { url: 'file:///player/index.html' };
    expect(() =>
      handler(
        { ...event, senderFrame: subframe } as Electron.IpcMainInvokeEvent,
        { action: 'load-game', params: {} },
      ),
    ).toThrow('来源不可信');

    expect(() =>
      handler(event, {
        action: 'get-media-url',
        params: { assetId: 'image', path: '/private/secret' },
      }),
    ).toThrow('格式无效');
    for (const invocation of [
      { action: 'get-settings', params: { path: '/private/secret' } },
      { action: 'update-settings', params: { patch: {} } },
      {
        action: 'update-settings',
        params: { patch: { masterVolume: Number.NaN } },
      },
      {
        action: 'update-settings',
        params: { patch: { videoVolume: 1.1 } },
      },
      {
        action: 'update-settings',
        params: { patch: { windowMode: 'borderless' } },
      },
      {
        action: 'update-settings',
        params: { patch: { windowSizePreset: 'custom', width: 1920 } },
      },
      {
        action: 'update-settings',
        params: { patch: { language: 'fr-FR' } },
      },
      {
        action: 'update-settings',
        params: { patch: { bgmVolume: 0.5 }, path: '/private/secret' },
      },
    ]) {
      expect(() => handler(event, invocation)).toThrow('格式无效');
    }
    expect(() =>
      handler(event, {
        action: 'quit-game',
        params: { force: true },
      }),
    ).toThrow('格式无效');
    expect(() =>
      handler(event, {
        action: 'open',
        params: { path: '/private/secret' },
      }),
    ).toThrow('格式无效');
    expect(() =>
      handler(event, {
        action: 'open-game',
        params: { path: '/private/secret' },
      }),
    ).toThrow('格式无效');
  });

  it('returns a safe load error without adding write or import operations', () => {
    const { handler } = register(null);
    expect(
      handler(trustedEvent(), { action: 'load-game', params: {} }),
    ).toEqual({
      status: 'error',
      mode: 'generic',
      error: 'bundle-load-failed',
    });
  });
});
