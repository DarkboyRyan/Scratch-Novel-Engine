/**
 * 主要作用：验证共享剧情执行、控制流、CG、人物和错误语义合同。
 * 关键函数与实现：测试套件“shared runtime execution contract”、`dialogue`、`emptyCgGallery`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it } from 'vitest';

import {
  advanceGame,
  completeCgLeadIn,
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  getLocalizedRuntimeErrorMessage,
  getChoices,
  MAX_LOGIC_STRING_BYTES,
  MAX_RUNTIME_VARIABLES,
  selectChoice,
  startGame,
  validateSceneControlFlow,
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
  return {
    pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
    style: { ...DEFAULT_CG_GALLERY_STYLE },
  };
}

function emptyStartScreen(
  title = '',
): ProjectDocument['startScreen'] {
  return {
    title,
    eyebrow: '',
    backgroundAssetId: null,
    musicAssetId: null,
    style: { ...DEFAULT_START_SCREEN_STYLE },
  };
}

describe('shared runtime execution contract', () => {
  it('keeps empty dialogue fields and advances to following nodes normally', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'empty-dialogue',
      name: 'Empty dialogue',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          {
            id: 'empty-line',
            type: 'dialogue',
            speaker: '',
            text: '',
            voiceAssetId: null,
          },
          {
            id: 'next-background',
            type: 'background',
            assetId: 'room',
            scalePercent: 100,
          },
          dialogue('following-line'),
        ],
      }],
    };

    const empty = startGame(project);
    expect(empty).not.toBeNull();
    if (!empty) {
      throw new Error('empty dialogue project did not start');
    }
    expect(empty).toMatchObject({
      dialogue: { id: 'empty-line', speaker: '', text: '' },
    });
    expect(advanceGame(project, empty)).toMatchObject({
      backgroundAssetId: 'room',
      dialogue: { id: 'following-line' },
    });
  });

  it('uses scene-initial image scale and rejects non-canonical clear scales', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'initial-scale',
      name: 'Initial scale',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: 'room',
        backgroundScalePercent: 80,
        nodes: [dialogue('line')],
      }],
    };

    expect(startGame(project)).toMatchObject({
      status: 'playing',
      backgroundAssetId: 'room',
      backgroundScalePercent: 80,
    });
    expect(startGame({
      ...project,
      scenes: [{
        ...project.scenes[0]!,
        backgroundAssetId: null,
        backgroundScalePercent: 80,
      }],
    })).toMatchObject({
      status: 'runtimeError',
      errorCode: 'imageScaleInvalid',
    });
  });

  it('applies background, character and BGM nodes before stopping at dialogue', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'project',
      name: 'Contract',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen('Story'),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: 'initial-background',
        backgroundScalePercent: 150,
        nodes: [
          {
            id: 'bg',
            type: 'background',
            assetId: 'room',
            scalePercent: 125,
          },
          { id: 'music', type: 'bgm', assetId: 'theme' },
          {
            id: 'hero',
            type: 'character',
            assetId: 'hero-image',
            slot: 'center',
            layer: 2,
            position: { x: 42, y: 91 },
            scalePercent: 70,
            effect: null,
          },
          dialogue('line', 'voice'),
        ],
      }],
    };

    expect(startGame(project)).toMatchObject({
      status: 'playing',
      backgroundAssetId: 'room',
      backgroundScalePercent: 125,
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
        scalePercent: 70,
      }],
    });
  });

  it('emits every character effect in an automatic batch and retains final opacity', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'character-effects',
      name: 'Character effects',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          {
            id: 'hero-out',
            type: 'character',
            assetId: 'hero',
            slot: 'left',
            layer: 1,
            position: null,
            scalePercent: 100,
            effect: { type: 'fadeOut', durationMs: 600 },
          },
          {
            id: 'friend-shake',
            type: 'character',
            assetId: 'friend',
            slot: 'right',
            layer: 2,
            position: { x: 75, y: 92 },
            scalePercent: 100,
            effect: {
              type: 'shake',
              durationMs: 400,
              intensity: 'strong',
            },
          },
          dialogue('effects-start'),
          dialogue('effects-finished'),
          {
            id: 'hero-return',
            type: 'character',
            assetId: 'hero-smile',
            slot: 'center',
            layer: 1,
            position: null,
            scalePercent: 100,
            effect: {
              type: 'slideIn',
              durationMs: 900,
              intensity: 'normal',
              direction: 'up',
            },
          },
          dialogue('new-effect'),
        ],
      }],
    };

    const first = startGame(project)!;
    expect(first.dialogue?.id).toBe('effects-start');
    expect(first.characters).toMatchObject([
      {
        nodeId: 'hero-out',
        opacity: 0,
        effectSequence: 1,
        effect: { type: 'fadeOut', durationMs: 600 },
      },
      {
        nodeId: 'friend-shake',
        opacity: 1,
        effectSequence: 2,
        effect: { type: 'shake', intensity: 'strong' },
      },
    ]);
    expect(first.characterEffectSequence).toBe(2);

    const second = advanceGame(project, first);
    expect(second.dialogue?.id).toBe('effects-finished');
    expect(second.characters).toMatchObject([
      { nodeId: 'hero-out', opacity: 0, effectSequence: 1, effect: null },
      { nodeId: 'friend-shake', opacity: 1, effectSequence: 2, effect: null },
    ]);

    const third = advanceGame(project, second);
    expect(third.dialogue?.id).toBe('new-effect');
    expect(third.characters[0]).toMatchObject({
      nodeId: 'hero-return',
      assetId: 'hero-smile',
      opacity: 1,
      effectSequence: 3,
      effect: { type: 'slideIn', direction: 'up' },
    });
    expect(third.characterEffectSequence).toBe(3);
  });

  it('replays the same character effect on every repeat iteration', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'replayed-effect',
      name: 'Replayed effect',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          { id: 'repeat', type: 'logicRepeat', count: 2 },
          {
            id: 'jumping-hero',
            type: 'character',
            assetId: 'hero',
            slot: 'center',
            layer: 1,
            position: null,
            scalePercent: 100,
            effect: { type: 'jump', durationMs: 500, intensity: 'normal' },
          },
          dialogue('loop-line'),
          {
            id: 'clear-jumping-hero',
            type: 'character',
            assetId: null,
            slot: 'center',
            layer: 1,
            position: null,
            scalePercent: 100,
            effect: null,
          },
          { id: 'repeat-end', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
        ],
      }],
    };

    const first = startGame(project)!;
    expect(first.characters[0]).toMatchObject({
      effectSequence: 1,
      effect: { type: 'jump' },
    });
    expect(first.characterEffectSequence).toBe(1);
    const second = advanceGame(project, first);
    expect(second.characters[0]).toMatchObject({
      effectSequence: 2,
      effect: { type: 'jump' },
    });
    expect(second.characterEffectSequence).toBe(2);
  });

  it('stops conservatively before a character event sequence would overflow', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'effect-sequence-overflow',
      name: 'Effect sequence overflow',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          dialogue('before-overflow'),
          {
            id: 'overflow-effect',
            type: 'character',
            assetId: 'hero',
            slot: 'center',
            layer: 1,
            position: null,
            scalePercent: 100,
            effect: { type: 'flash', durationMs: 300, intensity: 'normal' },
          },
          dialogue('after-overflow'),
        ],
      }],
    };

    const before = startGame(project)!;
    const overflow = advanceGame(project, {
      ...before,
      characterEffectSequence: Number.MAX_SAFE_INTEGER,
    });
    expect(overflow).toMatchObject({
      status: 'runtimeError',
      errorCode: 'characterEffectInvalid',
      characterEffectSequence: Number.MAX_SAFE_INTEGER,
      characters: [],
    });
  });

  it('rejects effects attached to a clear-character action', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'invalid-clear-effect',
      name: 'Invalid clear effect',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [{
          id: 'invalid-clear',
          type: 'character',
          assetId: null,
          slot: 'left',
          layer: 1,
          position: null,
          scalePercent: 100,
          effect: { type: 'fadeOut', durationMs: 500 },
        }],
      }],
    };
    expect(startGame(project)).toMatchObject({
      status: 'runtimeError',
      errorCode: 'characterEffectInvalid',
    });
  });

  it('skips empty video and choice nodes but blocks on assigned video', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'video-project',
      name: 'Video',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen('Story'),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
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

  it('waits for a CG lead-in, keeps the CG through its dialogue body, then clears it', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'cg-display',
      name: 'CG display',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          { id: 'cg', type: 'cgDisplay', assetId: 'cg-image', leadInMs: 750 },
          dialogue('cg-line-1'),
          dialogue('cg-line-2'),
          { id: 'cg-end', type: 'cgEndDisplay', cgDisplayNodeId: 'cg' },
          dialogue('outside'),
        ],
      }],
    };

    const waiting = startGame(project)!;
    expect(waiting).toMatchObject({
      status: 'waitingCgLeadIn',
      nextNodeIndex: 1,
      cgAssetId: 'cg-image',
      cgLeadInMs: 750,
      cgSequence: 1,
      dialogue: null,
    });
    expect(advanceGame(project, waiting)).toBe(waiting);

    const first = completeCgLeadIn(project, waiting);
    expect(first).toMatchObject({
      status: 'playing',
      dialogue: { id: 'cg-line-1' },
      cgAssetId: 'cg-image',
      cgLeadInMs: 0,
    });
    const second = advanceGame(project, first);
    expect(second).toMatchObject({
      dialogue: { id: 'cg-line-2' },
      cgAssetId: 'cg-image',
    });
    expect(advanceGame(project, second)).toMatchObject({
      dialogue: { id: 'outside' },
      cgAssetId: null,
      cgLeadInMs: 0,
    });
  });

  it('supports an empty CG body nested in if/repeat and retriggers each iteration', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'nested-cg',
      name: 'Nested CG',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          { id: 'repeat', type: 'logicRepeat', count: 2 },
          {
            id: 'if',
            type: 'logicIf',
            condition: {
              left: { kind: 'literal', value: true },
              operator: 'eq',
              right: { kind: 'literal', value: true },
            },
          },
          { id: 'cg', type: 'cgDisplay', assetId: 'cg-image', leadInMs: 0 },
          { id: 'cg-end', type: 'cgEndDisplay', cgDisplayNodeId: 'cg' },
          { id: 'else', type: 'logicElse', ifNodeId: 'if' },
          dialogue('else-line'),
          { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if' },
          { id: 'repeat-end', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
          dialogue('outside'),
        ],
      }],
    };

    const firstWait = startGame(project)!;
    expect(firstWait).toMatchObject({
      status: 'waitingCgLeadIn',
      cgSequence: 1,
      loopStack: [{ repeatNodeId: 'repeat', remainingIterations: 2 }],
    });
    const secondWait = completeCgLeadIn(project, firstWait);
    expect(secondWait).toMatchObject({
      status: 'waitingCgLeadIn',
      cgSequence: 2,
      loopStack: [{ repeatNodeId: 'repeat', remainingIterations: 1 }],
    });
    expect(completeCgLeadIn(project, secondWait)).toMatchObject({
      status: 'playing',
      dialogue: { id: 'outside' },
      cgAssetId: null,
      loopStack: [],
    });
  });

  it('strictly rejects non-dialogue nodes and nested controls in a CG body', () => {
    const wrap = (body: SceneNode[]) => [
      { id: 'cg', type: 'cgDisplay' as const, assetId: 'image', leadInMs: 100 },
      ...body,
      { id: 'cg-end', type: 'cgEndDisplay' as const, cgDisplayNodeId: 'cg' },
    ];
    expect(validateSceneControlFlow(wrap([
      { id: 'jump', type: 'sceneJump', targetSceneId: 'other' },
    ]))).toContain('只能放置对白');
    expect(validateSceneControlFlow(wrap([
      { id: 'choice', type: 'choice', options: [] },
    ]))).toContain('只能放置对白');
    expect(validateSceneControlFlow(wrap([
      { id: 'nested', type: 'cgDisplay', assetId: 'image-2', leadInMs: 0 },
    ]))).toContain('只能放置对白');
  });

  it('blocks on choices and enters the selected scene with target visuals', () => {
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'choice-project',
      name: 'Choice',
      entrySceneId: 'entry',
      startScreen: emptyStartScreen('Story'),
      cgGallery: emptyCgGallery(),
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: 'entry-bg',
          backgroundScalePercent: 100,
          nodes: [
            { id: 'music', type: 'bgm', assetId: 'theme' },
            {
              id: 'hero',
              type: 'character',
              assetId: 'hero-image',
              slot: 'left',
              layer: 1,
              position: null,
              scalePercent: 100,
              effect: null,
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
          backgroundScalePercent: 100,
          nodes: [
            {
              id: 'target-bg',
              type: 'background',
              assetId: 'target-bg',
              scalePercent: 100,
            },
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
      startScreen: emptyStartScreen('Story'),
      cgGallery: emptyCgGallery(),
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
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
          backgroundScalePercent: 140,
          nodes: [dialogue('target-line')],
        },
      ],
    };

    expect(startGame(project)).toMatchObject({
      status: 'playing',
      sceneId: 'target',
      backgroundAssetId: 'target-bg',
      backgroundScalePercent: 140,
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
      startScreen: emptyStartScreen('Story'),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [],
      }],
    };
    expect(startGame(finished)?.status).toBe('finished');

    const cyclic: ProjectDocument = {
      schemaVersion: 1,
      id: 'cyclic',
      name: 'Cyclic',
      entrySceneId: 'a',
      startScreen: emptyStartScreen('Story'),
      cgGallery: emptyCgGallery(),
      scenes: [
        {
          schemaVersion: 1,
          id: 'a',
          name: 'A',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
          nodes: [{ id: 'ab', type: 'sceneJump', targetSceneId: 'b' }],
        },
        {
          schemaVersion: 1,
          id: 'b',
          name: 'B',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
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
      startScreen: emptyStartScreen('Story'),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
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
      startScreen: emptyStartScreen('Logic'),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
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
          {
            id: 'win-bg',
            type: 'background',
            assetId: 'win',
            scalePercent: 100,
          },
          { id: 'repeat', type: 'logicRepeat', count: 3 },
          { id: 'change', type: 'variableChange', variableName: 'score', amount: 1 },
          dialogue('inside-loop'),
          { id: 'end-repeat', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
          { id: 'else', type: 'logicElse', ifNodeId: 'if' },
          {
            id: 'lose-bg',
            type: 'background',
            assetId: 'lose',
            scalePercent: 100,
          },
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
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
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
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
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
          backgroundScalePercent: 100,
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
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [
        {
          schemaVersion: 1,
          id: 'entry',
          name: 'Entry',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
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
          backgroundScalePercent: 100,
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
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
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
      startScreen: emptyStartScreen(),
      cgGallery: emptyCgGallery(),
      scenes: [{
        schemaVersion: 1,
        id: 'entry',
        name: 'Entry',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
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
