/**
 * 文件主要作用：验证可编辑剧情 DSL 对全部投影语法的逆向解析、身份复用与引用消歧。
 */

import { describe, expect, it } from 'vitest';

import {
  parseEditableSceneCode,
} from '../../src/renderer/features/code-editor/sceneCodeParser';
import { projectSceneToReadonlyCode } from '../../src/renderer/features/code-editor/sceneCodeProjection';
import type {
  AssetDocument,
  ProjectDocument,
  SceneDocument,
} from '../../src/shared/projectTypes';

const assets: AssetDocument[] = [
  { id: 'room', type: 'image', displayName: 'Room' },
  { id: 'hall', type: 'image', displayName: 'Hall' },
  { id: 'actor', type: 'image', displayName: 'Actor' },
  { id: 'cg-image', type: 'image', displayName: 'Ending CG' },
  { id: 'voice', type: 'audio', displayName: 'Voice' },
  { id: 'music', type: 'audio', displayName: 'Music' },
  { id: 'movie', type: 'video', displayName: 'Movie' },
];

const targetScene: SceneDocument = {
  schemaVersion: 1,
  id: 'target-scene',
  name: 'Next',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [],
};

function fullScene(): SceneDocument {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Start',
    backgroundAssetId: 'room',
    backgroundScalePercent: 80,
    nodes: [
      { id: 'dialogue-1', type: 'dialogue', speaker: '', text: '', voiceAssetId: 'voice' },
      { id: 'background-1', type: 'background', assetId: 'hall', scalePercent: 125 },
      {
        id: 'character-1',
        type: 'character',
        mode: 'show',
        assetId: 'actor',
        slot: 'right',
        layer: 2,
        position: { x: 80, y: 72.5 },
        scalePercent: 90,
        effect: { type: 'slideIn', durationMs: 600, intensity: 'normal', direction: 'left' },
      },
      {
        id: 'character-clear',
        type: 'character',
        mode: 'clear',
        assetId: null,
        slot: 'left',
        layer: 3,
        position: null,
        scalePercent: 100,
        effect: null,
      },
      { id: 'jump-1', type: 'sceneJump', targetSceneId: targetScene.id },
      { id: 'bgm-1', type: 'bgm', assetId: 'music' },
      { id: 'video-1', type: 'video', assetId: 'movie' },
      {
        id: 'choice-1',
        type: 'choice',
        options: [{ id: 'option-1', text: 'Continue', targetSceneId: targetScene.id }],
      },
      { id: 'set-1', type: 'variableSet', variableName: 'route', value: 'A' },
      { id: 'change-1', type: 'variableChange', variableName: 'score', amount: -2.5 },
      {
        id: 'if-1',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'A' },
        },
      },
      { id: 'repeat-1', type: 'logicRepeat', count: 2 },
      { id: 'nested-line', type: 'dialogue', speaker: '', text: 'Again', voiceAssetId: null },
      { id: 'repeat-end', type: 'logicEndRepeat', repeatNodeId: 'repeat-1' },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      { id: 'cg-1', type: 'cgDisplay', assetId: 'cg-image', leadInMs: 500 },
      { id: 'cg-line', type: 'dialogue', speaker: 'A', text: 'End', voiceAssetId: null },
      { id: 'cg-end', type: 'cgEndDisplay', cgDisplayNodeId: 'cg-1' },
      { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
      { id: 'page-1', type: 'storyExtension' },
    ],
  };
}

function parseScene(scene: SceneDocument, source?: string, allAssets = assets) {
  const project = { scenes: [scene, targetScene] } as Pick<ProjectDocument, 'scenes'>;
  const projection = projectSceneToReadonlyCode({ scene, project, assets: allAssets });
  return {
    projection,
    result: parseEditableSceneCode({
      source: source ?? projection.source,
      scene,
      project,
      assets: allAssets,
      previousProjection: projection,
    }),
  };
}

describe('editable scene Code parser', () => {
  it('round-trips every currently formatted story node and preserves author identities', () => {
    const scene = fullScene();
    const { projection, result } = parseScene(scene);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canonicalSource).toBe(projection.source);
    expect(result.draft.name).toBe('Start');
    expect(result.draft.initialBackground).toEqual({ assetId: 'room', scalePercent: 80 });
    expect(result.draft.nodes.map((node) => [node.type, node.originId])).toEqual([
      ['dialogue', 'dialogue-1'],
      ['background', 'background-1'],
      ['character', 'character-1'],
      ['character', 'character-clear'],
      ['sceneJump', 'jump-1'],
      ['bgm', 'bgm-1'],
      ['video', 'video-1'],
      ['choice', 'choice-1'],
      ['variableSet', 'set-1'],
      ['variableChange', 'change-1'],
      ['if', 'if-1'],
      ['storyExtension', 'page-1'],
    ]);
    const choice = result.draft.nodes.find((node) => node.type === 'choice');
    expect(choice?.type === 'choice' ? choice.options[0]?.originId : null).toBe('option-1');
    const condition = result.draft.nodes.find((node) => node.type === 'if');
    expect(condition?.type === 'if' ? condition.thenNodes[0] : null).toMatchObject({
      type: 'repeat',
      originId: 'repeat-1',
    });
    expect(condition?.type === 'if' ? condition.elseNodes[0] : null).toMatchObject({
      type: 'cg',
      originId: 'cg-1',
    });
    expect(result.sourceRanges).toContainEqual(expect.objectContaining({ id: 'cg-line' }));
  });

  it('accepts empty dialogue, edits the scene name, and leaves a new statement without originId', () => {
    const scene: SceneDocument = {
      ...fullScene(),
      nodes: [{ id: 'empty', type: 'dialogue', speaker: '', text: '', voiceAssetId: null }],
    };
    const { projection } = parseScene(scene);
    const source = projection.source
      .replace('scene("Start")', 'scene("Renamed")')
      .replace('  say("")', '  say("")\n  say("New line")');
    const { result } = parseScene(scene, source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.name).toBe('Renamed');
    expect(result.draft.nodes).toEqual([
      { originId: 'empty', type: 'dialogue', speaker: '', text: '', voiceAssetId: null },
      { type: 'dialogue', speaker: '', text: 'New line', voiceAssetId: null },
    ]);
    expect(result.canonicalSource).toContain('scene("Renamed")');
  });

  it('accepts a named speaker in say() exactly as shown in the Code editor', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Start',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [],
    };
    const source = [
      'story 1',
      '',
      'scene("Start") {',
      '  background(none, initial: true)',
      '',
      '  say("test?", speaker: "Father")',
      '}',
      '',
    ].join('\n');
    const { result } = parseScene(scene, source, []);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.nodes).toEqual([{
      type: 'dialogue',
      speaker: 'Father',
      text: 'test?',
      voiceAssetId: null,
    }]);
  });

  it('returns a precise diagnostic and no draft for malformed source', () => {
    const scene = fullScene();
    const { projection } = parseScene(scene);
    const source = projection.source.replace('scale: 125', 'scale: 301');
    const line = source.slice(0, source.indexOf('scale: 301')).split('\n').length;
    const { result } = parseScene(scene, source);

    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'invalidValue',
        line,
        field: 'scale',
      })],
    });
    expect('draft' in result).toBe(false);
  });

  it('rejects missing and ambiguous new asset references instead of guessing', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Start',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [],
    };
    const project = { scenes: [scene, targetScene] } as Pick<ProjectDocument, 'scenes'>;
    const source = [
      'story 1',
      '',
      'scene("Start") {',
      '  background(none, initial: true)',
      '',
      '  background(image("assets/images/Duplicate"), scale: 100)',
      '}',
      '',
    ].join('\n');
    const duplicateAssets: AssetDocument[] = [
      { id: 'duplicate-1', type: 'image', displayName: 'Duplicate' },
      { id: 'duplicate-2', type: 'image', displayName: 'Duplicate' },
    ];
    const ambiguous = parseEditableSceneCode({ source, scene, project, assets: duplicateAssets });
    expect(ambiguous).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'ambiguousReference',
        reference: 'assets/images/Duplicate',
      })],
    });

    const missing = parseEditableSceneCode({
      source: source.replace('Duplicate', 'Missing'),
      scene,
      project,
      assets: duplicateAssets,
    });
    expect(missing).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'missingReference' })],
    });
  });

  it('keeps an existing duplicate-name reference only when origin identity proves it', () => {
    const duplicateAssets: AssetDocument[] = [
      { id: 'duplicate-1', type: 'image', displayName: 'Duplicate' },
      { id: 'duplicate-2', type: 'image', displayName: 'Duplicate' },
    ];
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Start',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [{ id: 'background-1', type: 'background', assetId: 'duplicate-2', scalePercent: 100 }],
    };
    const { result } = parseScene(scene, undefined, duplicateAssets);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.nodes[0]).toEqual({
      originId: 'background-1',
      type: 'background',
      assetId: 'duplicate-2',
      scalePercent: 100,
    });
  });

  it('does not lend a deleted node identity to a moved-and-edited duplicate asset reference', () => {
    const duplicateAssets: AssetDocument[] = [
      { id: 'duplicate-1', type: 'image', displayName: 'Duplicate' },
      { id: 'duplicate-2', type: 'image', displayName: 'Duplicate' },
    ];
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Start',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [{ id: 'old-background', type: 'background', assetId: 'duplicate-2', scalePercent: 100 }],
    };
    const project = { scenes: [scene, targetScene] } as Pick<ProjectDocument, 'scenes'>;
    const previousProjection = projectSceneToReadonlyCode({
      scene,
      project,
      assets: duplicateAssets,
    });
    const source = [
      'story 1',
      '',
      'scene("Start") {',
      '  background(none, initial: true)',
      '',
      '  repeat(2) {',
      '    background(image("assets/images/Duplicate"), scale: 125)',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = parseEditableSceneCode({
      source,
      scene,
      project,
      assets: duplicateAssets,
      previousProjection,
    });
    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'ambiguousReference' })],
    });
  });

  it('does not lend a deleted option identity to a moved-and-edited duplicate scene reference', () => {
    const duplicateTarget: SceneDocument = {
      ...targetScene,
      id: 'target-scene-duplicate',
    };
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Start',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [{
        id: 'old-choice',
        type: 'choice',
        options: [{ id: 'old-option', text: 'Old', targetSceneId: duplicateTarget.id }],
      }],
    };
    const project = {
      scenes: [scene, targetScene, duplicateTarget],
    } as Pick<ProjectDocument, 'scenes'>;
    const previousProjection = projectSceneToReadonlyCode({
      scene,
      project,
      assets: [],
    });
    const source = [
      'story 1',
      '',
      'scene("Start") {',
      '  background(none, initial: true)',
      '',
      '  repeat(2) {',
      '    choice {',
      '      option("New", target: scene("Next"))',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = parseEditableSceneCode({
      source,
      scene,
      project,
      assets: [],
      previousProjection,
    });
    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'ambiguousReference' })],
    });
  });

  it('rejects strings that exceed downstream scene, speaker, and choice limits', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Start',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [],
    };
    const project = { scenes: [scene, targetScene] } as Pick<ProjectDocument, 'scenes'>;
    const wrap = (name: string, body: string): string => [
      'story 1',
      '',
      `scene(${JSON.stringify(name)}) {`,
      '  background(none, initial: true)',
      body,
      '}',
      '',
    ].join('\n');

    const longName = parseEditableSceneCode({
      source: wrap('界'.repeat(1_366), ''),
      scene,
      project,
      assets: [],
    });
    expect(longName).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'invalidSceneName' })],
    });

    const longSpeaker = parseEditableSceneCode({
      source: wrap('Start', `  say("", speaker: ${JSON.stringify('a'.repeat(4_097))})`),
      scene,
      project,
      assets: [],
    });
    expect(longSpeaker).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'invalidValue', field: 'speaker' })],
    });

    const longChoice = parseEditableSceneCode({
      source: wrap('Start', [
        '  choice {',
        `    option(${JSON.stringify('a'.repeat(65_537))}, target: scene("Next"))`,
        '  }',
      ].join('\n')),
      scene,
      project,
      assets: [],
    });
    expect(longChoice).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'invalidValue', field: 'text' })],
    });
  });

  it('rejects the 10,001st draft entity before crossing IPC', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Start',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [],
    };
    const project = { scenes: [scene, targetScene] } as Pick<ProjectDocument, 'scenes'>;
    const source = [
      'story 1',
      '',
      'scene("Start") {',
      '  background(none, initial: true)',
      '',
      ...Array.from({ length: 10_001 }, () => '  say("")'),
      '}',
      '',
    ].join('\n');

    const result = parseEditableSceneCode({
      source,
      scene,
      project,
      assets: [],
    });
    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'invalidStructure',
        field: 'nodes',
        line: 10_006,
      })],
    });
  });
});
