import { describe, expect, it } from 'vitest';

import {
  advanceGame,
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
      snapshotVersion: 2,
      status: 'playing',
      sceneId: 'entry',
      nextNodeIndex: 4,
      backgroundAssetId: 'room',
      bgmAssetId: 'theme',
      bgmSequence: 1,
      dialogueSequence: 1,
      videoSequence: 0,
      characters: [{
        nodeId: 'character',
        assetId: 'alice',
        slot: 'left',
        layer: 2,
        position: { x: 25, y: 90 },
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
    expect(snapshot?.snapshotVersion).toBe(2);
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
