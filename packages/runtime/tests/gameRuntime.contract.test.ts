import { describe, expect, it } from 'vitest';

import {
  advanceGame,
  getLocalizedRuntimeErrorMessage,
  getChoices,
  MAX_LOGIC_STRING_BYTES,
  MAX_RUNTIME_VARIABLES,
  selectChoice,
  startGame,
  type ProjectDocument,
  type SceneNode,
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

function emptyCgGallery(): ProjectDocument['cgGallery'] {
  return { pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }] };
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
      cgGallery: emptyCgGallery(),
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
      cgGallery: emptyCgGallery(),
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
      cgGallery: emptyCgGallery(),
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
      cgGallery: emptyCgGallery(),
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
      cgGallery: emptyCgGallery(),
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
      cgGallery: emptyCgGallery(),
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
      cgGallery: emptyCgGallery(),
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

  it('executes if/else and finite repeat bodies while preserving loop state', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'logic',
      name: 'Logic',
      entrySceneId: 'entry',
      startScreen: { title: 'Logic', backgroundAssetId: null, musicAssetId: null },
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [
          { id: 'set', type: 'variableSet', variableName: 'score', value: 2 },
          {
            id: 'if',
            type: 'logicIf',
            condition: {
              left: { kind: 'variable', name: 'score' },
              operator: 'gte',
              right: { kind: 'literal', value: 2 },
            },
          },
          { id: 'win-bg', type: 'background', assetId: 'win' },
          { id: 'repeat', type: 'logicRepeat', count: 3 },
          { id: 'change', type: 'variableChange', variableName: 'score', amount: 1 },
          dialogue('inside-loop'),
          { id: 'end-repeat', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
          { id: 'else', type: 'logicElse', ifNodeId: 'if' },
          { id: 'lose-bg', type: 'background', assetId: 'lose' },
          { id: 'endif', type: 'logicEndIf', ifNodeId: 'if' },
          dialogue('after-loop'),
        ],
      }],
    };

    const first = startGame(project)!;
    expect(first).toMatchObject({
      status: 'playing',
      backgroundAssetId: 'win',
      variables: { score: 3 },
      dialogue: { id: 'inside-loop' },
      loopStack: [{ repeatNodeId: 'repeat', remainingIterations: 3 }],
    });
    const second = advanceGame(project, first);
    expect(second).toMatchObject({
      variables: { score: 4 },
      dialogue: { id: 'inside-loop' },
      loopStack: [{ remainingIterations: 2 }],
    });
    const third = advanceGame(project, second);
    expect(third).toMatchObject({
      variables: { score: 5 },
      dialogue: { id: 'inside-loop' },
      loopStack: [{ remainingIterations: 1 }],
    });
    expect(advanceGame(project, third)).toMatchObject({
      dialogue: { id: 'after-loop' },
      loopStack: [],
      variables: { score: 5 },
    });
  });

  it('uses zero for undefined variables and rejects invalid numeric operations', () => {
    const undefinedVariable: ProjectDocument = {
      schemaVersion: 1,
      id: 'undefined-variable',
      name: 'Undefined variable',
      entrySceneId: 'entry',
      startScreen: { title: '', backgroundAssetId: null, musicAssetId: null },
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [
          { id: 'change', type: 'variableChange', variableName: 'score', amount: 2 },
          dialogue('changed'),
        ],
      }],
    };
    expect(startGame(undefinedVariable)).toMatchObject({ variables: { score: 2 } });

    const invalidChange: ProjectDocument = {
      ...undefinedVariable,
      scenes: [{
        ...undefinedVariable.scenes[0]!,
        nodes: [
          { id: 'set-text', type: 'variableSet', variableName: 'score', value: 'two' },
          { id: 'change', type: 'variableChange', variableName: 'score', amount: 1 },
        ],
      }],
    };
    expect(startGame(invalidChange)).toMatchObject({ status: 'runtimeError' });
  });

  it('preserves loop frames at video/choice blockers and clears them on branches', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'blocking-logic',
      name: 'Blocking logic',
      entrySceneId: 'entry',
      startScreen: { title: '', backgroundAssetId: null, musicAssetId: null },
      cgGallery: emptyCgGallery(),
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: null,
          nodes: [
            { id: 'repeat', type: 'logicRepeat', count: 2 },
            { id: 'video', type: 'video', assetId: 'clip' },
            {
              id: 'choice',
              type: 'choice',
              options: [{ id: 'go', text: 'Go', targetSceneId: 'target' }],
            },
            { id: 'end-repeat', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
          ],
        },
        {
          schemaVersion: 1,
          id: 'target',
          name: 'Target',
          backgroundAssetId: null,
          nodes: [dialogue('target-dialogue')],
        },
      ],
    };

    const video = startGame(project)!;
    expect(video).toMatchObject({
      status: 'playingVideo',
      loopStack: [{ repeatNodeId: 'repeat', remainingIterations: 2 }],
    });
    const choice = advanceGame(project, video);
    expect(choice).toMatchObject({ status: 'choosing', loopStack: [{ repeatNodeId: 'repeat' }] });
    expect(selectChoice(project, choice, 'go')).toMatchObject({
      sceneId: 'target',
      loopStack: [],
      dialogue: { id: 'target-dialogue' },
    });
  });

  it('clears loop frames on a scene jump while preserving global variables', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'jump-from-loop',
      name: 'Jump from loop',
      entrySceneId: 'entry',
      startScreen: { title: '', backgroundAssetId: null, musicAssetId: null },
      cgGallery: emptyCgGallery(),
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: null,
          nodes: [
            { id: 'repeat', type: 'logicRepeat', count: 2 },
            { id: 'change', type: 'variableChange', variableName: 'visits', amount: 1 },
            { id: 'jump', type: 'sceneJump', targetSceneId: 'target' },
            { id: 'end-repeat', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
          ],
        },
        {
          schemaVersion: 1,
          id: 'target',
          name: 'Target',
          backgroundAssetId: null,
          nodes: [dialogue('target-line')],
        },
      ],
    };

    expect(startGame(project)).toMatchObject({
      sceneId: 'target',
      variables: { visits: 1 },
      loopStack: [],
      dialogue: { id: 'target-line' },
    });
  });

  it('rejects malformed control markers and stops large automatic loops', () => {
    const malformed: ProjectDocument = {
      schemaVersion: 1,
      id: 'malformed',
      name: 'Malformed',
      entrySceneId: 'entry',
      startScreen: { title: '', backgroundAssetId: null, musicAssetId: null },
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [
          {
            id: 'if',
            type: 'logicIf',
            condition: {
              left: { kind: 'literal', value: true },
              operator: 'eq',
              right: { kind: 'literal', value: true },
            },
          },
          { id: 'endif', type: 'logicEndIf', ifNodeId: 'if' },
        ],
      }],
    };
    expect(startGame(malformed)).toMatchObject({ status: 'runtimeError' });

    const hugeLoop: ProjectDocument = {
      ...malformed,
      id: 'huge-loop',
      scenes: [{
        ...malformed.scenes[0]!,
        nodes: [
          { id: 'outer', type: 'logicRepeat', count: 1_000 },
          { id: 'inner', type: 'logicRepeat', count: 1_000 },
          { id: 'end-inner', type: 'logicEndRepeat', repeatNodeId: 'inner' },
          { id: 'end-outer', type: 'logicEndRepeat', repeatNodeId: 'outer' },
        ],
      }],
    };
    expect(startGame(hugeLoop)).toMatchObject({
      status: 'runtimeError',
      errorCode: 'logicStepLimit',
      errorMessage: '自动执行步骤过多，已停止以避免程序卡死',
    });
    expect(getLocalizedRuntimeErrorMessage(
      startGame(hugeLoop)!,
      'en-US',
      'fallback',
    )).toBe('Automatic execution was stopped to prevent the game from freezing.');
  });

  it('keeps automatic-loop fingerprints bounded with maximum variable payloads', () => {
    const maximumString = 'x'.repeat(MAX_LOGIC_STRING_BYTES);
    const variableNodes: SceneNode[] = Array.from(
      { length: MAX_RUNTIME_VARIABLES },
      (_, index) => ({
        id: `set-${index}`,
        type: 'variableSet',
        variableName: `value${index}`,
        value: maximumString,
      }),
    );
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'bounded-fingerprint',
      name: 'Bounded fingerprint',
      entrySceneId: 'entry',
      startScreen: { title: '', backgroundAssetId: null, musicAssetId: null },
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [
          ...variableNodes,
          { id: 'outer', type: 'logicRepeat', count: 1_000 },
          { id: 'inner', type: 'logicRepeat', count: 1_000 },
          { id: 'end-inner', type: 'logicEndRepeat', repeatNodeId: 'inner' },
          { id: 'end-outer', type: 'logicEndRepeat', repeatNodeId: 'outer' },
        ],
      }],
    };

    expect(startGame(project)).toMatchObject({
      status: 'runtimeError',
      errorCode: 'logicStepLimit',
    });
  });
});
