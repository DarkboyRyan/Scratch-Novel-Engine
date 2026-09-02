/**
 * 文件主要作用：验证当前场景到只读 Code DSL 的纯投影。
 * 测试覆盖：主要节点、空对白、嵌套隐藏标记、可读引用、源码范围与零写入。
 */

import { describe, expect, it } from 'vitest';

import { findDeepestCodeSourceRange } from '../../src/renderer/features/code-editor/codeFormatter';
import { projectSceneToReadonlyCode } from '../../src/renderer/features/code-editor/sceneCodeProjection';
import type {
  AssetDocument,
  ProjectDocument,
  SceneDocument,
} from '../../src/shared/projectTypes';

function projectWith(
  scene: SceneDocument,
  assets: readonly AssetDocument[] = [],
  otherScenes: SceneDocument[] = [],
) {
  const project = {
    scenes: [scene, ...otherScenes],
  } as Pick<ProjectDocument, 'scenes'>;
  return projectSceneToReadonlyCode({ scene, project, assets });
}

function emptyScene(overrides: Partial<SceneDocument> = {}): SceneDocument {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: '醒来',
    backgroundAssetId: null,
    backgroundScalePercent: 100,
    nodes: [],
    ...overrides,
  };
}

describe('read-only scene Code projection', () => {
  it('projects the scene header and initial background with readable logical paths', () => {
    const scene = emptyScene({
      backgroundAssetId: 'asset-room',
      backgroundScalePercent: 80,
    });

    const projection = projectWith(scene, [
      { id: 'asset-room', type: 'image', displayName: '卧室 "清晨"' },
    ]);
    expect(projection).toEqual({
      source: [
        'story 1',
        '',
        'scene("醒来") {',
        '  background(image("assets/images/卧室 %22清晨%22"), scale: 80, initial: true)',
        '}',
        '',
      ].join('\n'),
      sourceRanges: [],
      diagnostics: [],
    });
    expect(projection.source).not.toContain('scene-1');
    expect(projection.source).not.toContain('asset-room');
  });

  it('keeps empty speaker and text legal while projecting media and visual nodes', () => {
    const scene = emptyScene({
      nodes: [
        {
          id: 'line-empty',
          type: 'dialogue',
          speaker: '',
          text: '',
          voiceAssetId: null,
        },
        {
          id: 'line-voice',
          type: 'dialogue',
          speaker: '格里高尔',
          text: '',
          voiceAssetId: 'voice-1',
        },
        {
          id: 'background-1',
          type: 'background',
          assetId: 'room-2',
          scalePercent: 125,
        },
        {
          id: 'background-clear',
          type: 'background',
          assetId: null,
          scalePercent: 100,
        },
        {
          id: 'character-1',
          type: 'character',
          mode: 'show',
          assetId: 'gregor',
          slot: 'right',
          layer: 2,
          position: { x: 80, y: 72 },
          scalePercent: 90,
          effect: {
            type: 'slideIn',
            durationMs: 600,
            intensity: 'normal',
            direction: 'left',
          },
        },
        {
          id: 'character-pending',
          type: 'character',
          mode: 'show',
          assetId: null,
          slot: 'left',
          layer: 3,
          position: null,
          scalePercent: 100,
          effect: null,
        },
        {
          id: 'character-clear',
          type: 'character',
          mode: 'clear',
          assetId: null,
          slot: 'center',
          layer: 2,
          position: null,
          scalePercent: 100,
          effect: null,
        },
        { id: 'bgm-play', type: 'bgm', assetId: 'music-1' },
        { id: 'bgm-stop', type: 'bgm', assetId: null },
        { id: 'video-play', type: 'video', assetId: 'video-1' },
        { id: 'video-pending', type: 'video', assetId: null },
        { id: 'page-2', type: 'storyExtension' },
      ],
    });
    const source = projectWith(scene, [
      { id: 'voice-1', type: 'audio', displayName: '空白停顿' },
      { id: 'room-2', type: 'image', displayName: '走廊' },
      { id: 'gregor', type: 'image', displayName: '格里高尔' },
      { id: 'music-1', type: 'audio', displayName: '雨声' },
      { id: 'video-1', type: 'video', displayName: '开场视频' },
    ]).source;

    expect(source).toContain('  say("")');
    expect(source).toContain(
      '  say("", speaker: "格里高尔", voice: audio("assets/audio/空白停顿"))',
    );
    expect(source).toContain(
      '  background(image("assets/images/走廊"), scale: 125)',
    );
    expect(source).toContain('  background(none)');
    expect(source).toContain(
      '  show(image("assets/images/格里高尔"), at: position(80, 72), slot: right, layer: 2, scale: 90, effect: slideIn(600ms, normal, left))',
    );
    expect(source).toContain(
      '  show(pending, at: left, layer: 3, scale: 100)',
    );
    expect(source).toContain('  clear(layer: 2)');
    expect(source).toContain('  bgm(audio("assets/audio/雨声"))');
    expect(source).toContain('  bgm(stop)');
    expect(source).toContain(
      '  play(video("assets/videos/开场视频"))',
    );
    expect(source).toContain('  play(video(pending))');
    expect(source).toContain('  pagebreak()');
    expect(source).not.toMatch(
      /voice-1|room-2|gregor|music-1|video-1/u,
    );
  });

  it('folds hidden markers into nested if, repeat, and CG braces', () => {
    const scene = emptyScene({
      nodes: [
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
        {
          id: 'then-line',
          type: 'dialogue',
          speaker: '',
          text: '敲门声',
          voiceAssetId: null,
        },
        {
          id: 'repeat-end',
          type: 'logicEndRepeat',
          repeatNodeId: 'repeat-1',
        },
        { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
        {
          id: 'cg-1',
          type: 'cgDisplay',
          assetId: 'family-cg',
          leadInMs: 500,
        },
        {
          id: 'cg-line',
          type: 'dialogue',
          speaker: '母亲',
          text: '退后！',
          voiceAssetId: null,
        },
        {
          id: 'cg-end',
          type: 'cgEndDisplay',
          cgDisplayNodeId: 'cg-1',
        },
        { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
      ],
    });
    const projection = projectWith(scene, [
      { id: 'family-cg', type: 'image', displayName: '家人后退' },
    ]);

    expect(projection.source).toContain([
      '  if ($route == "A") {',
      '    repeat(2) {',
      '      say("敲门声")',
      '    }',
      '  } else {',
      '    cg(image("assets/images/家人后退"), lead: 500ms) {',
      '      say("退后！", speaker: "母亲")',
      '    }',
      '  }',
    ].join('\n'));
    expect(projection.source).not.toContain('logicElse');
    expect(projection.source).not.toContain('logicEnd');
    expect(projection.sourceRanges).toEqual(expect.arrayContaining([
      { id: 'if-1', kind: 'sceneNode', startLine: 6, endLine: 14 },
      { id: 'repeat-1', kind: 'sceneNode', startLine: 7, endLine: 9 },
      { id: 'then-line', kind: 'sceneNode', startLine: 8, endLine: 8 },
      { id: 'cg-1', kind: 'sceneNode', startLine: 11, endLine: 13 },
      { id: 'cg-line', kind: 'sceneNode', startLine: 12, endLine: 12 },
    ]));
    expect(findDeepestCodeSourceRange(projection.sourceRanges, 8)).toEqual({
      id: 'then-line',
      kind: 'sceneNode',
      startLine: 8,
      endLine: 8,
    });
  });

  it('projects variables, choices, and scene jumps with line identities', () => {
    const target = emptyScene({ id: 'scene-family', name: '面对家人' });
    const scene = emptyScene({
      nodes: [
        {
          id: 'set-1',
          type: 'variableSet',
          variableName: 'courage',
          value: 0,
        },
        {
          id: 'change-1',
          type: 'variableChange',
          variableName: 'social pressure',
          amount: -2,
        },
        {
          id: 'choice-1',
          type: 'choice',
          options: [{
            id: 'option-1',
            text: '打开门',
            targetSceneId: target.id,
          }],
        },
        { id: 'jump-1', type: 'sceneJump', targetSceneId: target.id },
      ],
    });
    const projection = projectWith(scene, [], [target]);

    expect(projection.source).toContain('  set($courage, value: 0)');
    expect(projection.source).toContain(
      '  change($["social pressure"], amount: -2)',
    );
    expect(projection.source).toContain(
      '    option("打开门", target: scene("面对家人"))',
    );
    expect(projection.source).toContain(
      '  jump(scene("面对家人"))',
    );
    expect(projection.source).not.toContain('scene-family');
    expect(projection.sourceRanges).toContainEqual({
      id: 'option-1',
      kind: 'choiceOption',
      startLine: 9,
      endLine: 9,
    });
    expect(projection.diagnostics).toEqual([]);
  });

  it('warns about missing references without changing the input documents', () => {
    const scene = emptyScene({
      nodes: [
        { id: 'bg-1', type: 'background', assetId: 'missing', scalePercent: 80 },
        { id: 'jump-1', type: 'sceneJump', targetSceneId: 'missing-scene' },
      ],
    });
    const before = structuredClone(scene);
    const projection = projectWith(scene);

    expect(scene).toEqual(before);
    expect(projection.source).toContain(
      'image("assets/images/%MISSING")',
    );
    expect(projection.source).toContain(
      'scene("<missing scene>")',
    );
    expect(projection.source).not.toContain('missing-scene');
    expect(projection.diagnostics.map((item) => item.code)).toEqual([
      'missingAsset',
      'missingScene',
    ]);
  });

  it('escapes unsafe display-name characters without exposing an asset ID', () => {
    const scene = emptyScene({
      nodes: [{
        id: 'bg-unsafe',
        type: 'background',
        assetId: 'private-asset-id',
        scalePercent: 100,
      }],
    });
    const projection = projectWith(scene, [{
      id: 'private-asset-id',
      type: 'image',
      displayName: '../卧室\\夜晚:*.png ',
    }]);

    expect(projection.source).toContain(
      'image("assets/images/%2E%2E%2F卧室%5C夜晚%3A%2A.png%20")',
    );
    expect(projection.source).not.toContain('private-asset-id');
    expect(projection.source).not.toContain('../');
    expect(projection.diagnostics).toEqual([]);
  });

  it('uses unambiguous UTF-8 byte escapes for different unsafe names', () => {
    const scene = emptyScene({
      nodes: [
        {
          id: 'bg-control',
          type: 'background',
          assetId: 'control-name',
          scalePercent: 100,
        },
        {
          id: 'bg-unicode',
          type: 'background',
          assetId: 'unicode-name',
          scalePercent: 100,
        },
      ],
    });
    const projection = projectWith(scene, [
      { id: 'control-name', type: 'image', displayName: '\u007fF' },
      { id: 'unicode-name', type: 'image', displayName: '\u07ff' },
    ]);

    expect(projection.source).toContain('assets/images/%7FF');
    expect(projection.source).toContain('assets/images/%DF%BF');
  });

  it('reports an invalid hidden-marker structure instead of mutating or throwing', () => {
    const scene = emptyScene({
      nodes: [
        { id: 'else-orphan', type: 'logicElse', ifNodeId: 'missing-if' },
      ],
    });
    const before = structuredClone(scene);
    const projection = projectWith(scene);

    expect(scene).toEqual(before);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'invalidStructure',
      }),
    ]);
    expect(projection.source).toContain(
      '// Timeline unavailable: invalid scene structure.',
    );
    expect(projection.source.endsWith('}\n')).toBe(true);
  });
});
