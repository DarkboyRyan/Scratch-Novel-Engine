/**
 * 主要作用：验证运行快照版本、往返恢复、兼容和拒绝规则。
 * 关键函数与实现：测试套件“versioned game runtime snapshots”、`project`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it } from 'vitest';

import {
  advanceGame,
  completeCgLeadIn,
  createGameRuntimeSnapshot,
  restoreGameRuntimeSnapshot,
  selectChoice,
  startGame,
  type ProjectDocument,
} from '../src';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'snapshot-project',
  name: 'Snapshot game',
  entrySceneId: 'entry',
  startScreen: {
    title: 'Snapshot game',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  scenes: [
    {
      schemaVersion: 1,
      id: 'entry',
      name: 'Entry',
      backgroundAssetId: 'entry-background',
      nodes: [
        { id: 'music', type: 'bgm', assetId: 'theme' },
        { id: 'background', type: 'background', assetId: 'room' },
        {
          id: 'character',
          type: 'character',
          assetId: 'alice',
          slot: 'left',
          layer: 2,
          position: { x: 25, y: 90 },
          effect: null,
        },
        {
          id: 'dialogue',
          type: 'dialogue',
          speaker: 'Alice',
          text: 'Hello',
          voiceAssetId: null,
        },
        { id: 'video', type: 'video', assetId: 'opening' },
        {
          id: 'choice',
          type: 'choice',
          options: [
            { id: 'continue', text: 'Continue', targetSceneId: 'ending' },
          ],
        },
      ],
    },
    {
      schemaVersion: 1,
      id: 'ending',
      name: 'Ending',
      backgroundAssetId: 'ending-background',
      nodes: [
        {
          id: 'ending-dialogue',
          type: 'dialogue',
          speaker: 'Narrator',
          text: 'End',
          voiceAssetId: null,
        },
      ],
    },
  ],
};

describe('versioned game runtime snapshots', () => {
  it('stores canonical control and presentation state for exact restoration', () => {
    const runtime = startGame(project);
    expect(runtime?.status).toBe('playing');
    const snapshot = createGameRuntimeSnapshot(project, runtime!);

    expect(snapshot).toEqual({
      snapshotVersion: 4,
      status: 'playing',
      sceneId: 'entry',
      nextNodeIndex: 4,
      backgroundAssetId: 'room',
      bgmAssetId: 'theme',
      bgmSequence: 1,
      dialogueSequence: 1,
      characterEffectSequence: 1,
      videoSequence: 0,
      cgAssetId: null,
      cgLeadInMs: 0,
      cgSequence: 0,
      characters: [{
        nodeId: 'character',
        assetId: 'alice',
        slot: 'left',
        layer: 2,
        position: { x: 25, y: 90 },
        opacity: 1,
        effectSequence: 1,
      }],
      variables: {},
      loopStack: [],
    });
    expect(snapshot).not.toHaveProperty('dialogue');
    expect(snapshot).not.toHaveProperty('choices');
    expect(snapshot).not.toHaveProperty('videoAssetId');

    expect(restoreGameRuntimeSnapshot(project, snapshot)).toEqual(runtime);
  });

  it('restores video and choice blocking nodes from the current project', () => {
    const dialogue = startGame(project)!;
    const video = advanceGame(project, dialogue);
    expect(video.status).toBe('playingVideo');
    expect(restoreGameRuntimeSnapshot(
      project,
      createGameRuntimeSnapshot(project, video),
    )).toEqual(video);

    const choice = advanceGame(project, video);
    expect(choice.status).toBe('choosing');
    expect(restoreGameRuntimeSnapshot(
      project,
      createGameRuntimeSnapshot(project, choice),
    )).toEqual(choice);

    const ending = selectChoice(project, choice, 'continue');
    expect(ending).toMatchObject({
      status: 'playing',
      sceneId: 'ending',
      bgmAssetId: 'theme',
    });
    expect(restoreGameRuntimeSnapshot(
      project,
      createGameRuntimeSnapshot(project, ending),
    )).toEqual(ending);
  });

  it('restores CG waiting from the full lead-in and preserves an active CG body', () => {
    const cgProject: ProjectDocument = {
      ...project,
      id: 'snapshot-cg',
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [
          { id: 'cg', type: 'cgDisplay', assetId: 'cg-image', leadInMs: 1200 },
          {
            id: 'cg-dialogue',
            type: 'dialogue',
            speaker: 'Narrator',
            text: 'Inside CG',
            voiceAssetId: null,
          },
          { id: 'cg-end', type: 'cgEndDisplay', cgDisplayNodeId: 'cg' },
          {
            id: 'outside',
            type: 'dialogue',
            speaker: 'Narrator',
            text: 'Outside CG',
            voiceAssetId: null,
          },
        ],
      }],
    };

    const waiting = startGame(cgProject)!;
    const waitingSnapshot = createGameRuntimeSnapshot(cgProject, waiting)!;
    expect(waitingSnapshot).toMatchObject({
      snapshotVersion: 4,
      status: 'waitingCgLeadIn',
      cgAssetId: 'cg-image',
      cgLeadInMs: 1200,
      cgSequence: 1,
    });
    expect(restoreGameRuntimeSnapshot(cgProject, waitingSnapshot)).toEqual(waiting);

    const body = completeCgLeadIn(cgProject, waiting);
    const bodySnapshot = createGameRuntimeSnapshot(cgProject, body)!;
    expect(bodySnapshot).toMatchObject({
      status: 'playing',
      cgAssetId: 'cg-image',
      cgLeadInMs: 0,
    });
    expect(restoreGameRuntimeSnapshot(cgProject, bodySnapshot)).toEqual(body);
    expect(restoreGameRuntimeSnapshot(cgProject, {
      ...waitingSnapshot,
      cgLeadInMs: 1199,
    })).toBeNull();
    expect(restoreGameRuntimeSnapshot(cgProject, {
      ...bodySnapshot,
      cgAssetId: null,
    })).toBeNull();
  });

  it('rejects forged derived state and malformed or stale cursors', () => {
    const runtime = startGame(project)!;
    expect(createGameRuntimeSnapshot(project, {
      ...runtime,
      dialogue: { ...runtime.dialogue!, text: 'forged' },
    })).toBeNull();
    expect(createGameRuntimeSnapshot(project, {
      ...runtime,
      backgroundAssetId: 'forged-background',
    })).toBeNull();

    const snapshot = createGameRuntimeSnapshot(project, runtime)!;
    expect(restoreGameRuntimeSnapshot(project, {
      ...snapshot,
      nextNodeIndex: 3,
    })).toBeNull();
    expect(restoreGameRuntimeSnapshot(project, {
      ...snapshot,
      unknown: true,
    })).toBeNull();
    expect(restoreGameRuntimeSnapshot(project, {
      ...snapshot,
      snapshotVersion: 99,
    })).toBeNull();
  });

  it('keeps snapshot v2 saves compatible when the project has no CG controls', () => {
    const runtime = startGame(project)!;
    const current = createGameRuntimeSnapshot(project, runtime)!;
    const v2Snapshot = {
      snapshotVersion: 2 as const,
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

    expect(restoreGameRuntimeSnapshot(project, v2Snapshot)).toEqual(runtime);
  });

  it('keeps snapshot v3 saves compatible without replaying character effects', () => {
    const runtime = startGame(project)!;
    const current = createGameRuntimeSnapshot(project, runtime)!;
    const v3Snapshot = {
      snapshotVersion: 3 as const,
      status: current.status,
      sceneId: current.sceneId,
      nextNodeIndex: current.nextNodeIndex,
      backgroundAssetId: current.backgroundAssetId,
      bgmAssetId: current.bgmAssetId,
      bgmSequence: current.bgmSequence,
      dialogueSequence: current.dialogueSequence,
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
      })),
      variables: current.variables,
      loopStack: current.loopStack,
    };

    expect(restoreGameRuntimeSnapshot(project, v3Snapshot)).toEqual(runtime);
  });

  it('stores final character opacity but strips transient effects on restore', () => {
    const effectProject: ProjectDocument = {
      ...project,
      id: 'snapshot-effect',
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Effect',
        backgroundAssetId: null,
        nodes: [
          {
            id: 'fade-out',
            type: 'character',
            assetId: 'alice',
            slot: 'center',
            layer: 1,
            position: null,
            effect: { type: 'fadeOut', durationMs: 800 },
          },
          {
            id: 'line',
            type: 'dialogue',
            speaker: 'Alice',
            text: 'Goodbye',
            voiceAssetId: null,
          },
          {
            id: 'clear',
            type: 'character',
            assetId: null,
            slot: 'center',
            layer: 1,
            position: null,
            effect: null,
          },
          {
            id: 'return',
            type: 'character',
            assetId: 'alice',
            slot: 'center',
            layer: 1,
            position: null,
            effect: { type: 'fadeIn', durationMs: 500 },
          },
          {
            id: 'returned-line',
            type: 'dialogue',
            speaker: 'Alice',
            text: 'I am back',
            voiceAssetId: null,
          },
        ],
      }],
    };
    const runtime = startGame(effectProject)!;
    expect(runtime.characters[0]).toMatchObject({
      opacity: 0,
      effectSequence: 1,
      effect: { type: 'fadeOut' },
    });

    const snapshot = createGameRuntimeSnapshot(effectProject, runtime)!;
    expect(snapshot.characterEffectSequence).toBe(1);
    expect(snapshot.characters[0]).toEqual({
      nodeId: 'fade-out',
      assetId: 'alice',
      slot: 'center',
      layer: 1,
      position: null,
      opacity: 0,
      effectSequence: 1,
    });
    expect(snapshot.characters[0]).not.toHaveProperty('effect');
    const restored = restoreGameRuntimeSnapshot(effectProject, snapshot)!;
    expect(restored.characters[0]).toEqual({
      nodeId: 'fade-out',
      assetId: 'alice',
      slot: 'center',
      layer: 1,
      position: null,
      opacity: 0,
      effect: null,
      effectSequence: 1,
    });
    expect(advanceGame(effectProject, restored)).toMatchObject({
      characterEffectSequence: 2,
      dialogue: { id: 'returned-line' },
      characters: [{
        nodeId: 'return',
        effect: { type: 'fadeIn' },
        effectSequence: 2,
      }],
    });
    expect(restoreGameRuntimeSnapshot(effectProject, {
      ...snapshot,
      characters: [{ ...snapshot.characters[0]!, opacity: 1 }],
    })).toBeNull();
    expect(restoreGameRuntimeSnapshot(effectProject, {
      ...snapshot,
      characters: [{ ...snapshot.characters[0]!, effectSequence: 0 }],
    })).toBeNull();
    expect(restoreGameRuntimeSnapshot(effectProject, {
      ...snapshot,
      characterEffectSequence: 0,
    })).toBeNull();

    const {
      characterEffectSequence: _characterEffectSequence,
      ...snapshotWithoutCharacterEffectSequence
    } = snapshot;
    const legacyV3 = {
      ...snapshotWithoutCharacterEffectSequence,
      snapshotVersion: 3,
      characters: snapshot.characters.map(({ opacity: _opacity, effectSequence: _sequence, ...rest }) => rest),
    };
    expect(restoreGameRuntimeSnapshot(effectProject, legacyV3)).toBeNull();
  });

  it('safely restores legacy v1 saves for projects without logic nodes', () => {
    expect(restoreGameRuntimeSnapshot(project, {
      snapshotVersion: 1,
      status: 'playing',
      sceneId: 'entry',
      nextNodeIndex: 4,
      bgmAssetId: 'theme',
      bgmSequence: 1,
      dialogueSequence: 1,
      videoSequence: 0,
    })).toEqual(startGame(project));
  });

  it('round-trips variables, loop position, and an earlier branch visual', () => {
    const logicProject: ProjectDocument = {
      ...project,
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Logic',
        backgroundAssetId: 'entry-background',
        nodes: [
          { id: 'set', type: 'variableSet', variableName: 'route', value: 1 },
          {
            id: 'if',
            type: 'logicIf',
            condition: {
              left: { kind: 'variable', name: 'route' },
              operator: 'eq',
              right: { kind: 'literal', value: 1 },
            },
          },
          { id: 'chosen-background', type: 'background', assetId: 'room' },
          { id: 'else', type: 'logicElse', ifNodeId: 'if' },
          { id: 'other-background', type: 'background', assetId: 'other-room' },
          { id: 'endif', type: 'logicEndIf', ifNodeId: 'if' },
          { id: 'overwrite', type: 'variableSet', variableName: 'route', value: 0 },
          { id: 'repeat', type: 'logicRepeat', count: 3 },
          {
            id: 'portrait',
            type: 'character',
            assetId: 'alice',
            slot: 'right',
            layer: 1,
            position: null,
            effect: null,
          },
          {
            id: 'loop-dialogue',
            type: 'dialogue',
            speaker: 'Loop',
            text: 'Again',
            voiceAssetId: null,
          },
          { id: 'end-repeat', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
          { id: 'after', type: 'dialogue', speaker: '', text: 'Done', voiceAssetId: null },
        ],
      }, project.scenes[1]!],
    };

    const first = startGame(logicProject)!;
    expect(first).toMatchObject({
      backgroundAssetId: 'room',
      variables: { route: 0 },
      loopStack: [{ repeatNodeId: 'repeat', remainingIterations: 3 }],
      dialogue: { id: 'loop-dialogue' },
    });
    const second = advanceGame(logicProject, first);
    expect(second.loopStack[0]?.remainingIterations).toBe(2);
    const snapshot = createGameRuntimeSnapshot(logicProject, second);
    expect(snapshot?.snapshotVersion).toBe(4);
    expect(restoreGameRuntimeSnapshot(logicProject, snapshot)).toEqual(second);
    expect(restoreGameRuntimeSnapshot(logicProject, {
      ...snapshot,
      variables: { ...snapshot?.variables, forged: 1 },
    })).toBeNull();
  });

  it('accepts the full 1 MiB dialogue limit used by runtime bundles', () => {
    const dialogueText = 'x'.repeat(1024 * 1024);
    const longDialogueProject: ProjectDocument = {
      ...project,
      scenes: [
        {
          ...project.scenes[0]!,
          nodes: [{
            id: 'long-dialogue',
            type: 'dialogue',
            speaker: '',
            text: dialogueText,
            voiceAssetId: null,
          }],
        },
        project.scenes[1]!,
      ],
    };
    const runtime = startGame(longDialogueProject)!;
    expect(createGameRuntimeSnapshot(longDialogueProject, runtime)).not.toBeNull();

    const oversizedProject: ProjectDocument = {
      ...longDialogueProject,
      scenes: [{
        ...longDialogueProject.scenes[0]!,
        nodes: [{
          id: 'long-dialogue',
          type: 'dialogue',
          speaker: '',
          text: `${dialogueText}x`,
          voiceAssetId: null,
        }],
      }, longDialogueProject.scenes[1]!],
    };
    expect(createGameRuntimeSnapshot(
      oversizedProject,
      startGame(oversizedProject)!,
    )).toBeNull();
  });
});
