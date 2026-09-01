/**
 * 主要作用：验证存档原子写入、列举、恢复、版本兼容与安全拒绝。
 * 关键函数与实现：测试套件“Player save storage”、`temporaryDirectories`、`project`、`game`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
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
  completeCgLeadIn,
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
    eyebrow: 'A VN ENGINE STORY',
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
      backgroundScalePercent: 100,
      nodes: [
        { id: 'music', type: 'bgm', assetId: 'theme' },
        {
          id: 'portrait',
          type: 'character',
          assetId: 'alice',
          slot: 'left',
          layer: 1,
          position: null,
          scalePercent: 100,
          effect: null,
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
  defaultLanguage: 'zh-CN',
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
        summary: {
          kind: 'dialogue',
          speaker: 'Alice',
          text: 'A safe summary',
        },
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

  it('restores persistent variables and the exact repeat position', async () => {
    const { store } = await makeStore();
    const logicProject: ProjectDocument = {
      ...project,
      scenes: [{
        ...project.scenes[0]!,
        nodes: [
          { id: 'set-score', type: 'variableSet', variableName: 'score', value: 0 },
          { id: 'repeat', type: 'logicRepeat', count: 3 },
          { id: 'raise-score', type: 'variableChange', variableName: 'score', amount: 1 },
          ...project.scenes[0]!.nodes,
          { id: 'end-repeat', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
        ],
      }],
    };
    const active: PlayerActiveGameContext = {
      game: { ...game, project: logicProject },
      generation: 1,
      identity: {
        projectId: logicProject.id,
        runtimeVersion: 7,
        contentFingerprint: 'b'.repeat(64),
      },
    };
    const runtime = startGame(logicProject)!;
    expect(runtime).toMatchObject({
      variables: { score: 1 },
      loopStack: [{ repeatNodeId: 'repeat', remainingIterations: 3 }],
    });
    const snapshot = createGameRuntimeSnapshot(logicProject, runtime)!;

    await expect(store.write(active, 1, snapshot, () => true)).resolves.toMatchObject({
      status: 'saved',
    });
    await expect(store.load(active, 1, () => true)).resolves.toEqual({
      status: 'loaded',
      runtime,
    });
  });

  it('restores a CG wait from its full lead-in and an active CG dialogue', async () => {
    const { store } = await makeStore();
    const cgProject: ProjectDocument = {
      ...project,
      id: 'cg-save-game',
      scenes: [{
        ...project.scenes[0]!,
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          { id: 'cg', type: 'cgDisplay', assetId: 'story-cg', leadInMs: 800 },
          {
            id: 'cg-line',
            type: 'dialogue',
            speaker: 'Narrator',
            text: 'CG line',
            voiceAssetId: null,
          },
          { id: 'cg-end', type: 'cgEndDisplay', cgDisplayNodeId: 'cg' },
        ],
      }],
    };
    const active: PlayerActiveGameContext = {
      game: {
        defaultLanguage: 'en-US',
        project: cgProject,
        assets: [{ id: 'story-cg', type: 'image', displayName: 'Story CG' }],
      },
      generation: 1,
      identity: {
        projectId: cgProject.id,
        runtimeVersion: 8,
        contentFingerprint: 'c'.repeat(64),
      },
    };
    const waiting = startGame(cgProject)!;
    const waitingSnapshot = createGameRuntimeSnapshot(cgProject, waiting)!;
    await expect(
      store.write(active, 1, waitingSnapshot, () => true),
    ).resolves.toMatchObject({
      status: 'saved',
      slot: { summary: { kind: 'progress' } },
    });
    await expect(store.load(active, 1, () => true)).resolves.toEqual({
      status: 'loaded',
      runtime: waiting,
    });

    const body = completeCgLeadIn(cgProject, waiting);
    const bodySnapshot = createGameRuntimeSnapshot(cgProject, body)!;
    await expect(
      store.write(active, 'quick', bodySnapshot, () => true),
    ).resolves.toMatchObject({ status: 'saved' });
    await expect(store.load(active, 'quick', () => true)).resolves.toEqual({
      status: 'loaded',
      runtime: body,
    });
  });

  it('loads legacy snapshot v1 saves and restores empty logic state safely', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const namespace = gameDirectory(root, active.identity);
    await mkdir(namespace, { recursive: true });
    await writeFile(path.join(namespace, 'slot-1.json'), JSON.stringify({
      format: 'vn-engine-player-save',
      saveVersion: 1,
      game: active.identity,
      slotId: 1,
      savedAt: '2026-08-24T06:00:00.000Z',
      snapshot: {
        snapshotVersion: 1,
        status: 'playing',
        sceneId: 'scene-1',
        nextNodeIndex: 3,
        bgmAssetId: 'theme',
        bgmSequence: 1,
        dialogueSequence: 1,
        videoSequence: 0,
      },
    }));

    await expect(store.load(active, 1, () => true)).resolves.toEqual({
      status: 'loaded',
      runtime: startGame(project),
    });
  });

  it('loads legacy snapshot v2, v3, and v4 saves after the snapshot v5 upgrade', async () => {
    const { root, store } = await makeStore();
    const active = activeContext();
    const runtime = startGame(project)!;
    const current = createGameRuntimeSnapshot(project, runtime)!;
    const snapshotV2 = {
      snapshotVersion: 2,
      status: current.status,
      sceneId: current.sceneId,
      nextNodeIndex: current.nextNodeIndex,
      backgroundAssetId: current.backgroundAssetId,
      bgmAssetId: current.bgmAssetId,
      bgmSequence: current.bgmSequence,
      dialogueSequence: current.dialogueSequence,
      videoSequence: current.videoSequence,
      characters: current.characters.map((character) => ({
        nodeId: character.nodeId,
        assetId: character.assetId,
        slot: character.slot,
        layer: character.layer,
        position: character.position,
      })),
      variables: current.variables,
      loopStack: current.loopStack,
    };
    const namespace = gameDirectory(root, active.identity);
    await mkdir(namespace, { recursive: true });
    const snapshotV3 = {
      ...snapshotV2,
      snapshotVersion: 3,
      cgAssetId: null,
      cgLeadInMs: 0,
      cgSequence: 0,
    };
    const snapshotV4 = {
      ...snapshotV3,
      snapshotVersion: 4,
      characterEffectSequence: current.characterEffectSequence,
      characters: current.characters.map((character) => ({
        nodeId: character.nodeId,
        assetId: character.assetId,
        slot: character.slot,
        layer: character.layer,
        position: character.position,
        opacity: character.opacity,
        effectSequence: character.effectSequence,
      })),
    };

    for (const snapshot of [snapshotV2, snapshotV3, snapshotV4]) {
      await writeFile(path.join(namespace, 'slot-1.json'), JSON.stringify({
        format: 'vn-engine-player-save',
        saveVersion: 1,
        game: active.identity,
        slotId: 1,
        savedAt: '2026-08-24T06:00:00.000Z',
        snapshot,
      }));

      await expect(store.load(active, 1, () => true)).resolves.toEqual({
        status: 'loaded',
        runtime,
      });
    }
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
      error: 'runtime-not-saveable',
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
      error: 'save-incompatible',
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
      error: 'save-incompatible',
    });

    await writeFile(
      path.join(gameDirectory(root), 'slot-2.json'),
      'x'.repeat(256 * 1024 + 1),
    );
    await expect(store.load(active, 2, () => true)).resolves.toEqual({
      status: 'rejected',
      error: 'save-incompatible',
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
      error: 'save-incompatible',
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

    await expect(store.list(active, () => true)).resolves.toEqual({
      status: 'rejected',
      error: 'save-storage-unavailable',
    });
    await expect(store.write(active, 1, snapshot, () => true)).resolves.toEqual({
      status: 'rejected',
      error: 'save-storage-unavailable',
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

    expect(result).toEqual({
      status: 'rejected',
      error: 'game-session-stale',
    });
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
    await expect(
      store.write(active, 1, snapshotFor(finishedRuntime), () => true),
    ).resolves.toMatchObject({
      status: 'saved',
      slot: { summary: { kind: 'finished' } },
    });

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
    expect(result).toEqual({
      status: 'rejected',
      error: 'game-session-stale',
    });
    await expect(readFile(
      path.join(gameDirectory(root), 'slot-1.json'),
      'utf8',
    )).resolves.toContain('"saveVersion":1');
  });
});
