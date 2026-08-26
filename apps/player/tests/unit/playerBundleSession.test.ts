import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PLAYER_BUNDLE_LOAD_ERROR,
  PLAYER_BUNDLE_SELECTION_ERROR,
  PLAYER_EMBEDDED_OPEN_ERROR,
  PlayerBundleSession,
} from '../../src/main/content/PlayerBundleSession';
import { PlayerMediaService } from '../../src/main/media/PlayerMediaService';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);
const temporaryDirectories: string[] = [];

async function makeBundle(
  name: string,
  options: { badHash?: boolean; runtimeVersion?: number } = {},
): Promise<string> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'vn-player-session-'));
  temporaryDirectories.push(temporaryRoot);
  const root = path.join(temporaryRoot, `${name}.vngame`);
  const runtimeVersion = options.runtimeVersion ?? 1;
  const imagePath = path.join(root, 'assets/images/image.png');
  await mkdir(path.dirname(imagePath), { recursive: true });
  await writeFile(imagePath, PNG);
  await writeFile(
    path.join(root, 'game.json'),
    JSON.stringify({
      format: 'vn-engine-runtime',
      runtimeVersion,
      game: {
        id: `project-${name}`,
        title: name,
        entrySceneId: `scene-${name}`,
        ...(runtimeVersion === 2 || runtimeVersion === 3
          ? {
              startScreen: {
                ...(runtimeVersion === 3 ? { title: `${name} title` } : {}),
                backgroundAssetId: 'image',
                musicAssetId: null,
              },
            }
          : {}),
      },
      scenes: [
        {
          schemaVersion: 1,
          id: `scene-${name}`,
          name: 'Scene',
          backgroundAssetId: 'image',
          nodes: [],
        },
      ],
    }),
  );
  await writeFile(
    path.join(root, 'manifest.json'),
    JSON.stringify({
      format: 'vn-engine-runtime-manifest',
      manifestVersion: 1,
      buildId: `build-${name}`,
      projectId: `project-${name}`,
      sourceRevision: 1,
      runtimeVersion,
      playerCompatibility: runtimeVersion === 1
        ? '>=1 <2'
        : runtimeVersion === 2
          ? '>=2 <3'
          : '>=3 <4',
      createdAt: '2026-08-18T00:00:00.000Z',
      files: [
        {
          assetId: 'image',
          type: 'image',
          displayName: `${name} image`,
          path: 'assets/images/image.png',
          mime: 'image/png',
          bytes: PNG.length,
          sha256: options.badHash
            ? '0'.repeat(64)
            : createHash('sha256').update(PNG).digest('hex'),
        },
      ],
    }),
  );
  return root;
}

function makeMediaService() {
  let handler: ((request: Request) => Promise<Response>) | null = null;
  const protocol = {
    handle: vi.fn(
      (
        _scheme: string,
        callback: (request: Request) => Promise<Response>,
      ) => {
        handler = callback;
      },
    ),
    unhandle: vi.fn(),
  };
  const service = new PlayerMediaService(
    protocol as unknown as Electron.Protocol,
  );
  return {
    service,
    request: (url: string) => {
      if (handler === null) {
        throw new Error('Player protocol handler was not registered');
      }
      return handler(new Request(url));
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Player bundle session', () => {
  it('opens two games atomically and invalidates the first capabilities', async () => {
    const first = await makeBundle('first');
    const second = await makeBundle('second');
    const selections = [first, second];
    const { service, request } = makeMediaService();
    const session = new PlayerBundleSession(
      service,
      async () => selections.shift() ?? null,
    );

    expect(session.loadGame()).toEqual({ status: 'empty', mode: 'generic' });
    await expect(session.openGame()).resolves.toMatchObject({
      status: 'opened',
      game: { project: { name: 'first' } },
    });
    const firstContext = session.getActiveGameContext();
    expect(firstContext).toMatchObject({
      generation: 1,
      identity: { projectId: 'project-first', runtimeVersion: 1 },
    });
    expect(session.isActiveGameContext(firstContext!)).toBe(true);
    const firstUrl = session.getMediaUrl('image');
    expect(firstUrl).toBeTruthy();
    expect((await request(firstUrl!)).status).toBe(200);

    await expect(session.openGame()).resolves.toMatchObject({
      status: 'opened',
      game: { project: { name: 'second' } },
    });
    const secondContext = session.getActiveGameContext();
    expect(secondContext).toMatchObject({
      generation: 2,
      identity: { projectId: 'project-second', runtimeVersion: 1 },
    });
    expect(session.isActiveGameContext(firstContext!)).toBe(false);
    expect(session.isActiveGameContext(secondContext!)).toBe(true);
    const secondUrl = session.getMediaUrl('image');
    expect(secondUrl).toBeTruthy();
    expect(secondUrl).not.toBe(firstUrl);
    expect((await request(firstUrl!)).status).toBe(404);
    expect((await request(secondUrl!)).status).toBe(200);
    expect(session.loadGame()).toMatchObject({
      status: 'loaded',
      mode: 'generic',
      game: { project: { name: 'second' } },
    });

    session.dispose();
    expect(session.getActiveGameContext()).toBeNull();
    expect(session.isActiveGameContext(secondContext!)).toBe(false);
  });

  it('rejects bad hashes and newer runtimes without disturbing the old game', async () => {
    const valid = await makeBundle('valid');
    const badHash = await makeBundle('bad-hash', { badHash: true });
    const tooNew = await makeBundle('too-new', { runtimeVersion: 8 });
    const selections = [valid, badHash, tooNew];
    const reportError = vi.fn();
    const { service, request } = makeMediaService();
    const session = new PlayerBundleSession(
      service,
      async () => selections.shift() ?? null,
      undefined,
      reportError,
    );

    await session.openGame();
    const oldUrl = session.getMediaUrl('image')!;

    await expect(session.openGame()).resolves.toEqual({
      status: 'rejected',
      error: PLAYER_BUNDLE_LOAD_ERROR,
    });
    await expect(session.openGame()).resolves.toEqual({
      status: 'rejected',
      error: PLAYER_BUNDLE_LOAD_ERROR,
    });
    expect(session.loadGame()).toMatchObject({
      status: 'loaded',
      mode: 'generic',
      game: { project: { name: 'valid' } },
    });
    const oldResponse = await request(oldUrl);
    expect(oldResponse.status).toBe(200);
    await oldResponse.arrayBuffer();
    expect(reportError).toHaveBeenCalledTimes(2);

    session.dispose();
  });

  it('preserves the empty session after cancel or invalid selection', async () => {
    const badHash = await makeBundle('bad-empty', { badHash: true });
    const selections: Array<string | null> = [null, badHash];
    const { service } = makeMediaService();
    const session = new PlayerBundleSession(
      service,
      async () => selections.shift() ?? null,
    );

    await expect(session.openGame()).resolves.toEqual({ status: 'canceled' });
    expect(session.loadGame()).toEqual({ status: 'empty', mode: 'generic' });
    await expect(session.openGame()).resolves.toEqual({
      status: 'rejected',
      error: PLAYER_BUNDLE_LOAD_ERROR,
    });
    expect(session.loadGame()).toEqual({ status: 'empty', mode: 'generic' });
    expect(session.getMediaUrl('image')).toBeNull();

    session.dispose();
  });

  it('deduplicates concurrent opens and rejects a directory without the suffix', async () => {
    let releaseSelection!: (value: string | null) => void;
    const selection = new Promise<string | null>((resolve) => {
      releaseSelection = resolve;
    });
    const selectBundle = vi.fn(() => selection);
    const mediaService = {
      activateBundle: vi.fn(),
      clearBundle: vi.fn(),
      getMediaUrl: vi.fn(() => null),
      dispose: vi.fn(),
    } as unknown as PlayerMediaService;
    const loadBundle = vi.fn();
    const session = new PlayerBundleSession(
      mediaService,
      selectBundle,
      loadBundle,
    );

    const firstOpen = session.openGame();
    const secondOpen = session.openGame();
    expect(selectBundle).toHaveBeenCalledOnce();
    releaseSelection('/tmp/not-a-package');
    await expect(firstOpen).resolves.toEqual({
      status: 'rejected',
      error: PLAYER_BUNDLE_LOAD_ERROR,
    });
    await expect(secondOpen).resolves.toEqual({
      status: 'rejected',
      error: PLAYER_BUNDLE_LOAD_ERROR,
    });
    expect(loadBundle).not.toHaveBeenCalled();

    session.dispose();
  });

  it('normalizes selector exceptions without exposing their messages', async () => {
    const reportError = vi.fn();
    const { service } = makeMediaService();
    const session = new PlayerBundleSession(
      service,
      async () => { throw new Error('/private/selector failure'); },
      undefined,
      reportError,
    );

    const result = await session.openGame();
    expect(result).toEqual({
      status: 'rejected',
      error: PLAYER_BUNDLE_SELECTION_ERROR,
    });
    expect(JSON.stringify(result)).not.toContain('/private');
    expect(reportError).toHaveBeenCalledOnce();
    session.dispose();
  });

  it('loads a valid embedded game before commit and disables replacement selection', async () => {
    const embedded = await makeBundle('embedded');
    const selectBundle = vi.fn();
    const { service, request } = makeMediaService();
    const session = new PlayerBundleSession(
      service,
      selectBundle,
      undefined,
      undefined,
      'embedded',
    );

    expect(session.loadGame()).toEqual({ status: 'empty', mode: 'embedded' });
    await session.loadEmbeddedGame(embedded);
    expect(session.loadGame()).toMatchObject({
      status: 'loaded',
      mode: 'embedded',
      game: { project: { name: 'embedded' } },
    });
    const mediaUrl = session.getMediaUrl('image');
    expect(mediaUrl).toBeTruthy();
    expect((await request(mediaUrl!)).status).toBe(200);
    await expect(session.openGame()).resolves.toEqual({
      status: 'rejected',
      error: PLAYER_EMBEDDED_OPEN_ERROR,
    });
    expect(selectBundle).not.toHaveBeenCalled();

    session.dispose();
  });

  it('keeps a damaged embedded game in a read-only error state', async () => {
    const embedded = await makeBundle('embedded-bad', { badHash: true });
    const selectBundle = vi.fn();
    const reportError = vi.fn();
    const { service } = makeMediaService();
    const session = new PlayerBundleSession(
      service,
      selectBundle,
      undefined,
      reportError,
      'embedded',
    );

    await session.loadEmbeddedGame(embedded);
    expect(session.loadGame()).toEqual({
      status: 'error',
      mode: 'embedded',
      error: PLAYER_BUNDLE_LOAD_ERROR,
    });
    expect(session.getMediaUrl('image')).toBeNull();
    await session.openGame();
    expect(selectBundle).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();

    session.dispose();
  });
});
