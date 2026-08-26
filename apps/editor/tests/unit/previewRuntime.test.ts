import { describe, expect, it } from 'vitest';

import {
  advanceGame as advanceGamePreview,
  getChoices as getGamePreviewChoices,
  selectChoice as selectGamePreviewChoice,
  startGame as startGamePreview,
  startGameAtScene as startGamePreviewAtScene,
  type ProjectDocument,
} from '@vnengine/runtime';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'project-1',
  name: 'Preview',
  entrySceneId: 'scene-entry',
  startScreen: {
    title: 'Story',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: {
    pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
  },
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-other',
      name: 'Not entry',
      backgroundAssetId: null,
      nodes: [],
    },
    {
      schemaVersion: 1,
      id: 'scene-entry',
      name: 'Entry',
      backgroundAssetId: 'initial',
      nodes: [
        { id: 'background', type: 'background', assetId: 'room' },
        { id: 'music', type: 'bgm', assetId: 'theme-audio' },
        {
          id: 'alice',
          type: 'character',
          assetId: 'alice-image',
          slot: 'left',
          layer: 1,
          position: null,
        },
        {
          id: 'd1',
          type: 'dialogue',
          speaker: 'A',
          text: 'one',
          voiceAssetId: 'voice-a',
        },
        {
          id: 'bob',
          type: 'character',
          assetId: 'bob-image',
          slot: 'right',
          layer: 2,
          position: { x: 82, y: 96 },
        },
        {
          id: 'replace',
          type: 'character',
          assetId: 'carol-image',
          slot: 'center',
          layer: 1,
          position: null,
        },
        {
          id: 'd2',
          type: 'dialogue',
          speaker: 'B',
          text: 'two',
          voiceAssetId: null,
        },
        {
          id: 'clear',
          type: 'character',
          assetId: null,
          slot: 'right',
          layer: 2,
          position: null,
        },
      ],
    },
  ],
};

describe('game preview runtime', () => {
  it('starts an Editor preview at the selected story scene instead of the project entry', () => {
    const selectedSceneProject: ProjectDocument = structuredClone(project);
    selectedSceneProject.scenes[0].backgroundAssetId = 'selected-background';
    selectedSceneProject.scenes[0].nodes = [
      {
        id: 'selected-dialogue',
        type: 'dialogue',
        speaker: 'B',
        text: 'selected scene',
        voiceAssetId: null,
      },
    ];

    expect(
      startGamePreviewAtScene(selectedSceneProject, 'scene-other'),
    ).toMatchObject({
      status: 'playing',
      sceneId: 'scene-other',
      nextNodeIndex: 1,
      backgroundAssetId: 'selected-background',
      dialogue: { id: 'selected-dialogue' },
    });
  });

  it('continues following authored scene jumps after starting from a selected scene', () => {
    const jumping: ProjectDocument = structuredClone(project);
    jumping.scenes[0].nodes = [
      {
        id: 'selected-dialogue',
        type: 'dialogue',
        speaker: 'B',
        text: 'before jump',
        voiceAssetId: null,
      },
      {
        id: 'jump-to-entry',
        type: 'sceneJump',
        targetSceneId: 'scene-entry',
      },
    ];

    const started = startGamePreviewAtScene(jumping, 'scene-other');
    if (!started) throw new Error('preview did not start');
    const afterJump = advanceGamePreview(jumping, started);

    expect(afterJump).toMatchObject({
      status: 'playing',
      sceneId: 'scene-entry',
      dialogue: { id: 'd1' },
    });
  });

  it('refuses missing or empty Editor preview scene selections safely', () => {
    const before = structuredClone(project);

    expect(startGamePreviewAtScene(project, 'missing')).toBeNull();
    expect(startGamePreviewAtScene(project, '')).toBeNull();
    expect(project).toEqual(before);
  });

  it('starts at the entry scene and auto-runs visual nodes to the first dialogue', () => {
    expect(startGamePreview(project)).toEqual({
      status: 'playing',
      sceneId: 'scene-entry',
      nextNodeIndex: 4,
      backgroundAssetId: 'room',
      bgmAssetId: 'theme-audio',
      bgmSequence: 1,
      dialogueSequence: 1,
      videoAssetId: null,
      videoSequence: 0,
      characters: [
        {
          nodeId: 'alice',
          assetId: 'alice-image',
          slot: 'left',
          layer: 1,
          position: null,
        },
      ],
      dialogue: {
        id: 'd1',
        type: 'dialogue',
        speaker: 'A',
        text: 'one',
        voiceAssetId: 'voice-a',
      },
      choices: [],
      variables: {},
      loopStack: [],
    });
  });

  it('advances to one dialogue at a time while applying intermediate portraits', () => {
    const started = startGamePreview(project);
    if (!started) throw new Error('preview did not start');
    const next = advanceGamePreview(project, started);

    expect(next.dialogue?.id).toBe('d2');
    expect(next.characters).toEqual([
      {
        nodeId: 'replace',
        assetId: 'carol-image',
        slot: 'center',
        layer: 1,
        position: null,
      },
      {
        nodeId: 'bob',
        assetId: 'bob-image',
        slot: 'right',
        layer: 2,
        position: { x: 82, y: 96 },
      },
    ]);

    const finished = advanceGamePreview(project, next);
    expect(finished.status).toBe('finished');
    expect(finished.dialogue).toBeNull();
    expect(finished.characters).toEqual([
      {
        nodeId: 'replace',
        assetId: 'carol-image',
        slot: 'center',
        layer: 1,
        position: null,
      },
    ]);
  });

  it('finishes an empty entry scene without mutating the project', () => {
    const emptyProject: ProjectDocument = {
      ...project,
      entrySceneId: 'scene-other',
    };
    const before = structuredClone(emptyProject);
    expect(startGamePreview(emptyProject)?.status).toBe('finished');
    expect(emptyProject).toEqual(before);
  });

  it('refuses a project whose entry scene is missing', () => {
    expect(
      startGamePreview({ ...project, entrySceneId: 'missing' }),
    ).toBeNull();
  });

  it('changes scenes only when a scene jump node is executed', () => {
    const jumping: ProjectDocument = structuredClone(project);
    jumping.scenes[1].nodes.push({
      id: 'jump',
      type: 'sceneJump',
      targetSceneId: 'scene-other',
    });
    jumping.scenes[0].backgroundAssetId = 'target-bg';
    jumping.scenes[0].nodes = [
      {
        id: 'target-d',
        type: 'dialogue',
        speaker: 'C',
        text: 'arrived',
        voiceAssetId: null,
      },
    ];
    let runtime = startGamePreview(jumping);
    if (!runtime) throw new Error('preview did not start');
    runtime = advanceGamePreview(jumping, runtime);
    runtime = advanceGamePreview(jumping, runtime);
    expect(runtime.sceneId).toBe('scene-other');
    expect(runtime.dialogue?.id).toBe('target-d');
    expect(runtime.backgroundAssetId).toBe('target-bg');
    expect(runtime.bgmAssetId).toBe('theme-audio');
    expect(runtime.characters).toEqual([]);
  });

  it('keeps music active until an explicit stop node', () => {
    const withStop: ProjectDocument = structuredClone(project);
    const secondDialogueIndex = withStop.scenes[1].nodes.findIndex(
      (node) => node.id === 'd2',
    );
    withStop.scenes[1].nodes.splice(secondDialogueIndex, 0, {
      id: 'stop-music',
      type: 'bgm',
      assetId: null,
    });

    const started = startGamePreview(withStop);
    if (!started) throw new Error('preview did not start');
    expect(started.bgmAssetId).toBe('theme-audio');
    expect(advanceGamePreview(withStop, started).bgmAssetId).toBeNull();
  });

  it('treats every BGM node as a new playback occurrence', () => {
    const repeated: ProjectDocument = structuredClone(project);
    const secondDialogueIndex = repeated.scenes[1].nodes.findIndex(
      (node) => node.id === 'd2',
    );
    repeated.scenes[1].nodes.splice(secondDialogueIndex, 0, {
      id: 'restart-music',
      type: 'bgm',
      assetId: 'theme-audio',
    });

    const first = startGamePreview(repeated);
    if (!first) throw new Error('preview did not start');
    const second = advanceGamePreview(repeated, first);
    expect(first.bgmAssetId).toBe('theme-audio');
    expect(second.bgmAssetId).toBe('theme-audio');
    expect(second.bgmSequence).toBe(first.bgmSequence + 1);
  });

  it('increments the dialogue occurrence when a jump revisits the same node', () => {
    const looping: ProjectDocument = {
      schemaVersion: 1,
      id: 'looping-dialogue',
      name: 'Looping dialogue',
      entrySceneId: 'loop',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: {
        pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'loop',
          name: 'Loop',
          backgroundAssetId: null,
          nodes: [
            {
              id: 'same-dialogue',
              type: 'dialogue',
              speaker: 'A',
              text: 'again',
              voiceAssetId: 'voice-a',
            },
            {
              id: 'repeat',
              type: 'sceneJump',
              targetSceneId: 'loop',
            },
          ],
        },
      ],
    };
    const first = startGamePreview(looping);
    if (!first) throw new Error('preview did not start');
    const second = advanceGamePreview(looping, first);

    expect(first.dialogue?.id).toBe('same-dialogue');
    expect(second.dialogue?.id).toBe('same-dialogue');
    expect(first.dialogueSequence).toBe(1);
    expect(second.dialogueSequence).toBe(2);
  });

  it('blocks on an assigned video, skips an empty slot, then resumes after it', () => {
    const withVideo: ProjectDocument = structuredClone(project);
    const secondDialogueIndex = withVideo.scenes[1].nodes.findIndex(
      (node) => node.id === 'd2',
    );
    withVideo.scenes[1].nodes.splice(
      secondDialogueIndex,
      0,
      { id: 'empty-video', type: 'video', assetId: null },
      { id: 'opening-video', type: 'video', assetId: 'opening.mp4' },
    );

    const firstDialogue = startGamePreview(withVideo);
    if (!firstDialogue) throw new Error('preview did not start');
    const video = advanceGamePreview(withVideo, firstDialogue);

    expect(video).toMatchObject({
      status: 'playingVideo',
      nextNodeIndex: secondDialogueIndex + 2,
      videoAssetId: 'opening.mp4',
      videoSequence: 1,
      dialogue: null,
      bgmAssetId: 'theme-audio',
    });

    const resumed = advanceGamePreview(withVideo, video);
    expect(resumed).toMatchObject({
      status: 'playing',
      videoAssetId: null,
      videoSequence: 1,
      dialogue: { id: 'd2' },
    });
  });

  it('detects a scene jump cycle without a dialogue', () => {
    const cyclic: ProjectDocument = {
      schemaVersion: 1,
      id: 'cycle',
      name: 'Cycle',
      entrySceneId: 'a',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: {
        pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'a',
          name: 'A',
          backgroundAssetId: null,
          nodes: [{ id: 'ab', type: 'sceneJump', targetSceneId: 'b' }],
        },
        {
          schemaVersion: 1,
          id: 'b',
          name: 'B',
          backgroundAssetId: null,
          nodes: [{ id: 'ba', type: 'sceneJump', targetSceneId: 'a' }],
        },
      ],
    };
    expect(startGamePreview(cyclic)?.status).toBe('runtimeError');
  });

  it('skips an empty choice and blocks on populated options', () => {
    const branching: ProjectDocument = structuredClone(project);
    const secondDialogueIndex = branching.scenes[1].nodes.findIndex(
      (node) => node.id === 'd2',
    );
    branching.scenes[1].nodes.splice(
      secondDialogueIndex,
      0,
      { id: 'empty-choice', type: 'choice', options: [] },
      {
        id: 'branch-choice',
        type: 'choice',
        options: [
          { id: 'left', text: '向左走', targetSceneId: 'scene-other' },
          { id: 'right', text: '向右走', targetSceneId: 'scene-entry' },
        ],
      },
    );

    const first = startGamePreview(branching);
    if (!first) throw new Error('preview did not start');
    const choosing = advanceGamePreview(branching, first);

    expect(choosing).toMatchObject({
      status: 'choosing',
      sceneId: 'scene-entry',
      nextNodeIndex: secondDialogueIndex + 2,
      dialogue: null,
      videoAssetId: null,
      choices: [
        { id: 'left', text: '向左走', targetSceneId: 'scene-other' },
        { id: 'right', text: '向右走', targetSceneId: 'scene-entry' },
      ],
    });
    expect(getGamePreviewChoices(branching, choosing)).toHaveLength(2);
  });

  it('selects a choice, resets target visuals, preserves BGM, and reduces onward', () => {
    const branching: ProjectDocument = {
      schemaVersion: 1,
      id: 'branching',
      name: 'Branching',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: {
        pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: 'entry-bg',
          nodes: [
            { id: 'music', type: 'bgm', assetId: 'theme' },
            {
              id: 'portrait',
              type: 'character',
              assetId: 'hero',
              slot: 'center',
              layer: 1,
              position: null,
            },
            {
              id: 'choice',
              type: 'choice',
              options: [
                { id: 'take-a', text: 'A', targetSceneId: 'target-a' },
                { id: 'take-b', text: 'B', targetSceneId: 'target-b' },
              ],
            },
          ],
        },
        {
          schemaVersion: 1,
          id: 'target-a',
          name: 'Target A',
          backgroundAssetId: 'target-a-initial',
          nodes: [
            { id: 'target-bg', type: 'background', assetId: 'target-bg' },
            {
              id: 'arrival',
              type: 'dialogue',
              speaker: 'A',
              text: 'arrived',
              voiceAssetId: null,
            },
          ],
        },
        {
          schemaVersion: 1,
          id: 'target-b',
          name: 'Target B',
          backgroundAssetId: null,
          nodes: [],
        },
      ],
    };

    const choosing = startGamePreview(branching);
    if (!choosing) throw new Error('preview did not start');
    expect(choosing.status).toBe('choosing');
    expect(choosing.characters).toHaveLength(1);

    const selected = selectGamePreviewChoice(branching, choosing, 'take-a');
    expect(selected).toMatchObject({
      status: 'playing',
      sceneId: 'target-a',
      nextNodeIndex: 2,
      backgroundAssetId: 'target-bg',
      bgmAssetId: 'theme',
      bgmSequence: 1,
      characters: [],
      dialogue: { id: 'arrival' },
      choices: [],
    });
  });

  it('reports malformed choice targets without changing scenes', () => {
    const branching: ProjectDocument = {
      schemaVersion: 1,
      id: 'missing-target',
      name: 'Missing target',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: {
        pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: null,
          nodes: [
            {
              id: 'choice',
              type: 'choice',
              options: [
                { id: 'broken', text: 'Broken', targetSceneId: 'missing' },
              ],
            },
          ],
        },
      ],
    };
    const choosing = startGamePreview(branching);
    if (!choosing) throw new Error('preview did not start');

    expect(
      selectGamePreviewChoice(branching, choosing, 'missing-option'),
    ).toMatchObject({
      status: 'runtimeError',
      errorMessage: '选择的选项不存在',
      choices: [],
    });
    expect(
      selectGamePreviewChoice(branching, choosing, 'broken'),
    ).toMatchObject({
      status: 'runtimeError',
      sceneId: 'entry',
      errorMessage: '选项跳转的目标场景不存在',
      choices: [],
    });
  });
});
