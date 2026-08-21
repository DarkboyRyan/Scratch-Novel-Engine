import { describe, expect, it } from 'vitest';

import {
  advanceGame,
  getChoices,
  selectChoice,
  startGame,
  type ProjectDocument,
} from '../src';

function dialogue(id: string, voiceAssetId: string | null = null) {
  return {
    id,
    type: 'dialogue' as const,
    speaker: '旁白',
    text: id,
    voiceAssetId,
  };
}

describe('shared runtime execution contract', () => {
  it('applies background, character and BGM nodes before stopping at dialogue', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'project',
      name: 'Contract',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: 'initial-background',
        nodes: [
          { id: 'bg', type: 'background', assetId: 'room' },
          { id: 'music', type: 'bgm', assetId: 'theme' },
          {
            id: 'hero',
            type: 'character',
            assetId: 'hero-image',
            slot: 'center',
            layer: 2,
            position: { x: 42, y: 91 },
          },
          dialogue('line', 'voice'),
        ],
      }],
    };

    expect(startGame(project)).toMatchObject({
      status: 'playing',
      backgroundAssetId: 'room',
      bgmAssetId: 'theme',
      bgmSequence: 1,
      dialogueSequence: 1,
      dialogue: { id: 'line', voiceAssetId: 'voice' },
      characters: [{
        nodeId: 'hero',
        assetId: 'hero-image',
        slot: 'center',
        layer: 2,
        position: { x: 42, y: 91 },
      }],
    });
  });

  it('skips empty video and choice nodes but blocks on assigned video', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'video-project',
      name: 'Video',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [
          { id: 'empty-video', type: 'video', assetId: null },
          { id: 'empty-choice', type: 'choice', options: [] },
          { id: 'video', type: 'video', assetId: 'opening-video' },
          dialogue('after-video'),
        ],
      }],
    };

    const video = startGame(project);
    expect(video).toMatchObject({
      status: 'playingVideo',
      videoAssetId: 'opening-video',
      videoSequence: 1,
    });
    if (!video) throw new Error('runtime did not start');
    expect(advanceGame(project, video)).toMatchObject({
      status: 'playing',
      dialogue: { id: 'after-video' },
      videoAssetId: null,
    });
  });

  it('blocks on choices and enters the selected scene with target visuals', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'choice-project',
      name: 'Choice',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
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
              id: 'hero',
              type: 'character',
              assetId: 'hero-image',
              slot: 'left',
              layer: 1,
              position: null,
            },
            {
              id: 'choice',
              type: 'choice',
              options: [{
                id: 'go',
                text: '前往下一场景',
                targetSceneId: 'target',
              }],
            },
          ],
        },
        {
          schemaVersion: 1,
          id: 'target',
          name: 'Target',
          backgroundAssetId: 'target-initial',
          nodes: [
            { id: 'target-bg', type: 'background', assetId: 'target-bg' },
            dialogue('arrived'),
          ],
        },
      ],
    };

    const choosing = startGame(project);
    if (!choosing) throw new Error('runtime did not start');
    expect(choosing.status).toBe('choosing');
    expect(getChoices(project, choosing)).toHaveLength(1);

    expect(selectChoice(project, choosing, 'go')).toMatchObject({
      status: 'playing',
      sceneId: 'target',
      backgroundAssetId: 'target-bg',
      bgmAssetId: 'theme',
      characters: [],
      dialogue: { id: 'arrived' },
    });
  });

  it('changes scenes only through SceneJump and preserves BGM', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'jump-project',
      name: 'Jump',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: null,
          nodes: [
            { id: 'music', type: 'bgm', assetId: 'theme' },
            { id: 'jump', type: 'sceneJump', targetSceneId: 'target' },
          ],
        },
        {
          schemaVersion: 1,
          id: 'target',
          name: 'Target',
          backgroundAssetId: 'target-bg',
          nodes: [dialogue('target-line')],
        },
      ],
    };

    expect(startGame(project)).toMatchObject({
      status: 'playing',
      sceneId: 'target',
      backgroundAssetId: 'target-bg',
      bgmAssetId: 'theme',
      dialogue: { id: 'target-line' },
    });
  });

  it('finishes at scene end and reports automatic jump cycles', () => {
    const finished: ProjectDocument = {
      schemaVersion: 1,
      id: 'finished',
      name: 'Finished',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [],
      }],
    };
    expect(startGame(finished)?.status).toBe('finished');

    const cyclic: ProjectDocument = {
      schemaVersion: 1,
      id: 'cyclic',
      name: 'Cyclic',
      entrySceneId: 'a',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
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
    expect(startGame(cyclic)).toMatchObject({
      status: 'runtimeError',
      errorMessage: '检测到没有对白或可选项可停留的场景跳转循环',
    });
  });

  it('increments dialogue occurrence when the same voice node is revisited', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'voice-loop',
      name: 'Voice loop',
      entrySceneId: 'entry',
      startScreen: {
        title: 'Story',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [
          dialogue('same-line', 'voice'),
          { id: 'loop', type: 'sceneJump', targetSceneId: 'entry' },
        ],
      }],
    };

    const first = startGame(project);
    if (!first) throw new Error('runtime did not start');
    const second = advanceGame(project, first);
    expect(first.dialogueSequence).toBe(1);
    expect(second.dialogueSequence).toBe(2);
    expect(second.dialogue?.id).toBe('same-line');
  });
});
