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
  it('stores only canonical cursor state and rebuilds derived presentation', () => {
    const runtime = startGame(project);
    expect(runtime?.status).toBe('playing');
    const snapshot = createGameRuntimeSnapshot(project, runtime!);

    expect(snapshot).toEqual({
      snapshotVersion: 1,
      status: 'playing',
      sceneId: 'entry',
      nextNodeIndex: 4,
      bgmAssetId: 'theme',
      bgmSequence: 1,
      dialogueSequence: 1,
      videoSequence: 0,
    });
    expect(snapshot).not.toHaveProperty('dialogue');
    expect(snapshot).not.toHaveProperty('choices');
    expect(snapshot).not.toHaveProperty('videoAssetId');
    expect(snapshot).not.toHaveProperty('characters');

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
      snapshotVersion: 2,
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
