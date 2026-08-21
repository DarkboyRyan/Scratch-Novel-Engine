import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('Player read-only IPC', () => {
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
      ? { status: 'error' as const, mode: 'generic' as const, error: 'runtime v1 无效' }
      : { status: 'loaded' as const, mode: 'generic' as const, game });
    const contexts = new Map([
      [
        42,
        {
          bundleSession: { loadGame, openGame, getMediaUrl },
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
      error: 'runtime v1 无效',
    });
  });
});
