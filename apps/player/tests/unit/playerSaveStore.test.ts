import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createGameRuntimeSnapshot,
  startGame,
  type GameRuntime,
  type GameRuntimeSnapshot,
  type ProjectDocument,
} from '@vnengine/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlayerActiveGameContext } from '../../src/main/content/PlayerBundleSession';
import { PlayerSaveStore } from '../../src/main/save/PlayerSaveStore';
import type { PlayerGameData } from '../../src/shared/playerProtocol';

const temporaryDirectories: string[] = [];

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'game/with/private-looking-id',
  name: 'Save game',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Save game',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'First scene',
      backgroundAssetId: 'background',
      nodes: [
        { id: 'music', type: 'bgm', assetId: 'theme' },
        {
          id: 'portrait',
          type: 'character',
          assetId: 'alice',
          slot: 'left',
          layer: 1,
          position: null,
        },
        {
          id: 'dialogue',
          type: 'dialogue',
          speaker: 'Alice',
          text: 'A safe summary',
          voiceAssetId: null,
        },
      ],
    },
  ],
};

const game: PlayerGameData = {
  project,
  assets: [
    { id: 'background', type: 'image', displayName: 'Background' },
    { id: 'alice', type: 'image', displayName: 'Alice' },
    { id: 'theme', type: 'audio', displayName: 'Theme' },
  ],
};

function activeContext(
  overrides: Partial<PlayerActiveGameContext['identity']> = {},
): PlayerActiveGameContext {
  return {
    game,
    generation: 1,
    identity: {
      projectId: project.id,
      runtimeVersion: 6,
      contentFingerprint: 'a'.repeat(64),
      ...overrides,
    },
  };
}

async function makeStore(reportError = vi.fn()) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'vn-player-save-'));
  temporaryDirectories.push(temporaryRoot);
  const root = path.join(temporaryRoot, 'saves');
  return {
    root,
    reportError,
    store: new PlayerSaveStore(
      root,
      reportError,
      () => new Date('2026-08-24T06:00:00.000Z'),
    ),
  };
}

function gameDirectory(
  root: string,
  identity = activeContext().identity,
): string {
  const directoryName = createHash('sha256')
    .update('vn-engine-player-save-namespace-v1\0', 'utf8')
    .update(identity.projectId, 'utf8')
    .update('\0', 'utf8')
    .update(String(identity.runtimeVersion), 'utf8')
    .update('\0', 'utf8')
    .update(identity.contentFingerprint, 'utf8')
    .digest('hex');
  return path.join(root, directoryName);
}

function snapshotFor(runtime: GameRuntime): GameRuntimeSnapshot {
  const snapshot = createGameRuntimeSnapshot(project, runtime);
  if (snapshot === null) {
    throw new Error('test runtime must be saveable');
  }
  return snapshot;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Player save storage', () => {
  it('atomically stores canonical snapshots and restores manual and quick slots', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const runtime = startGame(project)!;
    const snapshot = snapshotFor(runtime);
    const isCurrent = () => true;

    await expect(store.write(active, 1, snapshot, isCurrent)).resolves.toEqual({
      status: 'saved',
      slot: {
        slotId: 1,
        savedAt: '2026-08-24T06:00:00.000Z',
        sceneName: 'First scene',
        summary: 'Alice：A safe summary',
      },
    });
    await expect(store.write(active, 'quick', snapshot, isCurrent)).resolves.toMatchObject({
      status: 'saved',
      slot: { slotId: 'quick' },
    });

    const namespaceEntries = await readdir(root);
    expect(namespaceEntries).toEqual([
      path.basename(gameDirectory(root, active.identity)),
    ]);
    expect(namespaceEntries[0]).not.toContain(project.id);
    const persisted = JSON.parse(await readFile(
      path.join(gameDirectory(root), 'slot-1.json'),
      'utf8',
    )) as Record<string, unknown>;
    expect(persisted).toMatchObject({
      format: 'vn-engine-player-save',
      saveVersion: 1,
      slotId: 1,
      game: {
        projectId: project.id,
        runtimeVersion: 6,
        contentFingerprint: 'a'.repeat(64),
      },
    });
    expect(persisted.snapshot).not.toHaveProperty('dialogue');
    expect(persisted.snapshot).not.toHaveProperty('choices');
    expect(persisted.snapshot).not.toHaveProperty('videoAssetId');

    await expect(store.list(active, isCurrent)).resolves.toMatchObject({
      status: 'ready',
      slots: [{ slotId: 1 }, { slotId: 'quick' }],
    });
    await expect(store.load(active, 1, isCurrent)).resolves.toEqual({
      status: 'loaded',
      runtime,
    });
  });

  it('rejects a forged snapshot before any file is published', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const runtime = startGame(project)!;
    const snapshot = snapshotFor(runtime);
    const result = await store.write(active, 1, {
      ...snapshot,
      nextNodeIndex: snapshot.nextNodeIndex - 1,
    }, () => true);

    expect(result).toEqual({
      status: 'rejected',
      error: '当前进度无法安全保存',
    });
    await expect(readdir(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('isolates games and binds saves to the content fingerprint', async () => {
    const { store } = await makeStore();
    const first = activeContext();
    const runtime = startGame(project)!;
    await store.write(first, 2, snapshotFor(runtime), () => true);

    const anotherProject: ProjectDocument = {
      ...project,
      id: 'another-project',
    };
    const another: PlayerActiveGameContext = {
      game: { ...game, project: anotherProject },
      generation: 2,
      identity: {
        ...first.identity,
        projectId: anotherProject.id,
      },
    };
    await expect(store.list(another, () => true)).resolves.toEqual({
      status: 'ready',
      slots: [],
    });
    await expect(store.load(another, 2, () => true)).resolves.toEqual({
      status: 'empty',
    });

    const changedBuild = activeContext({ contentFingerprint: 'b'.repeat(64) });
    await expect(store.list(changedBuild, () => true)).resolves.toEqual({
      status: 'ready',
      slots: [],
    });
    await expect(store.load(changedBuild, 2, () => true)).resolves.toEqual({
      status: 'empty',
    });
  });

  it('isolates a corrupt slot while preserving other valid summaries', async () => {
    const reportError = vi.fn();
    const { root, store } = await makeStore(reportError);
    const active = activeContext();
    const runtime = startGame(project)!;
    const snapshot = snapshotFor(runtime);
    await store.write(active, 1, snapshot, () => true);
    await store.write(active, 2, snapshot, () => true);
    await writeFile(path.join(gameDirectory(root), 'slot-1.json'), '{broken');

    await expect(store.list(active, () => true)).resolves.toMatchObject({
      status: 'ready',
      slots: [{ slotId: 2 }],
    });
    await expect(store.load(active, 1, () => true)).resolves.toEqual({
      status: 'rejected',
      error: '存档无效或与当前游戏版本不兼容',
    });
    expect(reportError).toHaveBeenCalled();
    expect(JSON.stringify(await store.load(active, 1, () => true)))
      .not.toContain(root);
  });

  it('rejects unknown document fields and oversized slot files', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const snapshot = snapshotFor(startGame(project)!);
    await store.write(active, 1, snapshot, () => true);
    const firstPath = path.join(gameDirectory(root), 'slot-1.json');
    const document = JSON.parse(await readFile(firstPath, 'utf8')) as Record<
      string,
      unknown
    >;
    document.privatePath = '/private/secret';
    await writeFile(firstPath, JSON.stringify(document));
    await expect(store.load(active, 1, () => true)).resolves.toEqual({
      status: 'rejected',
      error: '存档无效或与当前游戏版本不兼容',
    });

    await writeFile(
      path.join(gameDirectory(root), 'slot-2.json'),
      'x'.repeat(256 * 1024 + 1),
    );
    await expect(store.load(active, 2, () => true)).resolves.toEqual({
      status: 'rejected',
      error: '存档无效或与当前游戏版本不兼容',
    });
  });

  it('never follows a save-slot symlink', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const { root, store } = await makeStore();
    const active = activeContext();
    const runtime = startGame(project)!;
    await store.write(active, 1, snapshotFor(runtime), () => true);
    const outside = path.join(path.dirname(root), 'outside.json');
    await writeFile(outside, '{"private":true}');
    await symlink(outside, path.join(gameDirectory(root), 'slot-3.json'));

    await expect(store.load(active, 3, () => true)).resolves.toEqual({
      status: 'rejected',
      error: '存档无效或与当前游戏版本不兼容',
    });
    expect(await readFile(outside, 'utf8')).toBe('{"private":true}');
  });

  it('never follows a symlinked save namespace', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const { root, store } = await makeStore();
    const redirectedDirectory = path.join(path.dirname(root), 'redirected');
    await mkdir(redirectedDirectory);
    await symlink(redirectedDirectory, root, 'dir');
    const active = activeContext();
    const snapshot = snapshotFor(startGame(project)!);

    await expect(store.list(active, () => true)).resolves.toMatchObject({
      status: 'rejected',
    });
    await expect(store.write(active, 1, snapshot, () => true)).resolves.toMatchObject({
      status: 'rejected',
    });
    await expect(readdir(redirectedDirectory)).resolves.toEqual([]);
  });

  it('checks the active bundle generation immediately before commit', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const runtime = startGame(project)!;
    const snapshot = snapshotFor(runtime);
    let checks = 0;
    const result = await store.write(active, 1, snapshot, () => {
      checks += 1;
      return checks === 1;
    });

    expect(result).toEqual({ status: 'rejected', error: '游戏已切换，请重试' });
    await expect(readFile(
      path.join(gameDirectory(root), 'slot-1.json'),
      'utf8',
    )).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the previous slot as a Windows-safe backup during overwrite', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const dialogueRuntime = startGame(project)!;
    const finishedRuntime: GameRuntime = {
      ...dialogueRuntime,
      status: 'finished',
      nextNodeIndex: project.scenes[0]!.nodes.length,
      dialogue: null,
      dialogueSequence: dialogueRuntime.dialogueSequence,
    };
    await store.write(active, 1, snapshotFor(dialogueRuntime), () => true);
    await store.write(active, 1, snapshotFor(finishedRuntime), () => true);

    await expect(store.load(active, 1, () => true)).resolves.toEqual({
      status: 'loaded',
      runtime: finishedRuntime,
    });
    const destination = path.join(gameDirectory(root), 'slot-1.json');
    const backup = `${destination}.bak`;
    expect(JSON.parse(await readFile(backup, 'utf8'))).toMatchObject({
      snapshot: { status: 'playing' },
    });

    await unlink(destination);
    await expect(store.load(active, 1, () => true)).resolves.toEqual({
      status: 'loaded',
      runtime: dialogueRuntime,
    });
  });

  it('checks the active bundle generation again after publication', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const runtime = startGame(project)!;
    let checks = 0;
    const result = await store.write(active, 1, snapshotFor(runtime), () => {
      checks += 1;
      return checks < 3;
    });

    expect(checks).toBe(3);
    expect(result).toEqual({ status: 'rejected', error: '游戏已切换，请重试' });
    await expect(readFile(
      path.join(gameDirectory(root), 'slot-1.json'),
      'utf8',
    )).resolves.toContain('"saveVersion":1');
  });
});
