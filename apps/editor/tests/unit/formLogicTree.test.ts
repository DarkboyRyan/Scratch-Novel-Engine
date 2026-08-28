/**
 * 文件主要作用：验证 form logic tree 的行为。
 * 测试覆盖：`form logic tree`。
 */

import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  createFormLogicTree,
  getFormNodeMovePlan,
} from '../../src/renderer/features/form-editor/formLogicTree';

describe('form logic tree', () => {
  it('uses indentation and branch rows while hiding paired markers and extensions', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Scene',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'if-1',
          type: 'logicIf',
          condition: {
            left: { kind: 'variable', name: 'score' },
            operator: 'gte',
            right: { kind: 'literal', value: 5 },
          },
        },
        {
          id: 'then-line',
          type: 'dialogue',
          speaker: 'A',
          text: 'Then',
          voiceAssetId: null,
        },
        { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
        { id: 'repeat-1', type: 'logicRepeat', count: 2 },
        {
          id: 'cg-1',
          type: 'cgDisplay',
          assetId: 'cg-image',
          leadInMs: 750,
        },
        {
          id: 'else-line',
          type: 'dialogue',
          speaker: 'B',
          text: 'Else',
          voiceAssetId: null,
        },
        {
          id: 'cg-end-1',
          type: 'cgEndDisplay',
          cgDisplayNodeId: 'cg-1',
        },
        {
          id: 'repeat-end',
          type: 'logicEndRepeat',
          repeatNodeId: 'repeat-1',
        },
        { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
        { id: 'extension-1', type: 'storyExtension' },
      ],
    };

    const entries = createFormLogicTree(scene);
    expect(entries.map((entry) => entry.kind === 'node'
      ? `${entry.node.id}@${entry.depth}`
      : `${entry.branch}@${entry.depth}`)).toEqual([
      'if-1@0',
      'then@1',
      'then-line@1',
      'else@1',
      'repeat-1@1',
      'body@2',
      'cg-1@2',
      'cgBody@3',
      'else-line@3',
    ]);
    expect(JSON.stringify(entries)).not.toContain('logicElse');
    expect(JSON.stringify(entries)).not.toContain('logicEndIf');
    expect(JSON.stringify(entries)).not.toContain('logicEndRepeat');
    expect(JSON.stringify(entries)).not.toContain('cgEndDisplay');
    expect(JSON.stringify(entries)).not.toContain('storyExtension');
  });

  it('plans root and CG-body moves without crossing the CG boundary', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-cg-moves',
      name: 'CG moves',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'before-cg',
          type: 'dialogue',
          speaker: '',
          text: 'Before',
          voiceAssetId: null,
        },
        { id: 'extension-hidden', type: 'storyExtension' },
        {
          id: 'cg-root',
          type: 'cgDisplay',
          assetId: 'cg-image',
          leadInMs: 500,
        },
        {
          id: 'cg-line-a',
          type: 'dialogue',
          speaker: '',
          text: 'A',
          voiceAssetId: null,
        },
        {
          id: 'cg-line-b',
          type: 'dialogue',
          speaker: '',
          text: 'B',
          voiceAssetId: null,
        },
        {
          id: 'cg-end',
          type: 'cgEndDisplay',
          cgDisplayNodeId: 'cg-root',
        },
        {
          id: 'after-cg',
          type: 'dialogue',
          speaker: '',
          text: 'After',
          voiceAssetId: null,
        },
      ],
    };

    expect(getFormNodeMovePlan(scene, 'before-cg', -1)).toBeNull();
    expect(getFormNodeMovePlan(scene, 'before-cg', 1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'after-cg',
    });
    expect(getFormNodeMovePlan(scene, 'cg-root', -1)).toEqual({
      kind: 'cgDisplay',
      beforeNodeId: 'before-cg',
    });
    expect(getFormNodeMovePlan(scene, 'cg-root', 1)).toEqual({
      kind: 'cgDisplay',
      beforeNodeId: null,
    });
    expect(getFormNodeMovePlan(scene, 'after-cg', -1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'cg-root',
    });
    expect(getFormNodeMovePlan(scene, 'after-cg', 1)).toBeNull();

    expect(getFormNodeMovePlan(scene, 'cg-line-a', -1)).toBeNull();
    expect(getFormNodeMovePlan(scene, 'cg-line-a', 1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'cg-end',
    });
    expect(getFormNodeMovePlan(scene, 'cg-line-b', -1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'cg-line-a',
    });
    expect(getFormNodeMovePlan(scene, 'cg-line-b', 1)).toBeNull();
    expect(getFormNodeMovePlan(scene, 'extension-hidden', 1)).toBeNull();
    expect(getFormNodeMovePlan(scene, 'cg-end', -1)).toBeNull();
  });

  it('keeps a one-step move before the next hidden page boundary', () => {
    const dialogue = (id: string): SceneDocument['nodes'][number] => ({
      id,
      type: 'dialogue',
      speaker: '',
      text: id,
      voiceAssetId: null,
    });
    const ordinaryScene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-page-leaf',
      name: 'Leaf page boundary',
      backgroundAssetId: null,
      nodes: [
        dialogue('leaf-a'),
        dialogue('leaf-b'),
        { id: 'page-extension', type: 'storyExtension' },
        dialogue('leaf-c'),
      ],
    };
    expect(getFormNodeMovePlan(ordinaryScene, 'leaf-a', 1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'page-extension',
    });

    const cgScene: SceneDocument = {
      ...ordinaryScene,
      id: 'scene-page-cg',
      name: 'CG page boundary',
      nodes: [
        {
          id: 'page-cg',
          type: 'cgDisplay',
          assetId: 'cg-image',
          leadInMs: 0,
        },
        {
          id: 'page-cg-end',
          type: 'cgEndDisplay',
          cgDisplayNodeId: 'page-cg',
        },
        dialogue('page-leaf'),
        { id: 'page-extension', type: 'storyExtension' },
        dialogue('next-page-leaf'),
      ],
    };
    expect(getFormNodeMovePlan(cgScene, 'page-cg', 1)).toEqual({
      kind: 'cgDisplay',
      beforeNodeId: 'page-extension',
    });
  });

  it('keeps nested moves within their own logic branch markers', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-logic-moves',
      name: 'Logic moves',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'if-root',
          type: 'logicIf',
          condition: {
            left: { kind: 'variable', name: 'score' },
            operator: 'gte',
            right: { kind: 'literal', value: 1 },
          },
        },
        {
          id: 'then-a',
          type: 'dialogue',
          speaker: '',
          text: 'Then A',
          voiceAssetId: null,
        },
        {
          id: 'then-b',
          type: 'dialogue',
          speaker: '',
          text: 'Then B',
          voiceAssetId: null,
        },
        { id: 'if-else', type: 'logicElse', ifNodeId: 'if-root' },
        { id: 'repeat-root', type: 'logicRepeat', count: 2 },
        {
          id: 'repeat-a',
          type: 'dialogue',
          speaker: '',
          text: 'Repeat A',
          voiceAssetId: null,
        },
        {
          id: 'repeat-b',
          type: 'dialogue',
          speaker: '',
          text: 'Repeat B',
          voiceAssetId: null,
        },
        {
          id: 'repeat-end',
          type: 'logicEndRepeat',
          repeatNodeId: 'repeat-root',
        },
        {
          id: 'else-tail',
          type: 'dialogue',
          speaker: '',
          text: 'Else tail',
          voiceAssetId: null,
        },
        { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-root' },
        {
          id: 'root-tail',
          type: 'dialogue',
          speaker: '',
          text: 'Root tail',
          voiceAssetId: null,
        },
      ],
    };

    expect(getFormNodeMovePlan(scene, 'then-a', -1)).toBeNull();
    expect(getFormNodeMovePlan(scene, 'then-a', 1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'if-else',
    });
    expect(getFormNodeMovePlan(scene, 'then-b', -1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'then-a',
    });
    expect(getFormNodeMovePlan(scene, 'then-b', 1)).toBeNull();

    expect(getFormNodeMovePlan(scene, 'repeat-root', -1)).toBeNull();
    expect(getFormNodeMovePlan(scene, 'repeat-root', 1)).toEqual({
      kind: 'logicControl',
      beforeNodeId: 'if-end',
    });
    expect(getFormNodeMovePlan(scene, 'else-tail', -1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'repeat-root',
    });
    expect(getFormNodeMovePlan(scene, 'else-tail', 1)).toBeNull();

    expect(getFormNodeMovePlan(scene, 'repeat-a', -1)).toBeNull();
    expect(getFormNodeMovePlan(scene, 'repeat-a', 1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'repeat-end',
    });
    expect(getFormNodeMovePlan(scene, 'repeat-b', -1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'repeat-a',
    });
    expect(getFormNodeMovePlan(scene, 'repeat-b', 1)).toBeNull();

    expect(getFormNodeMovePlan(scene, 'if-root', 1)).toEqual({
      kind: 'logicControl',
      beforeNodeId: null,
    });
    expect(getFormNodeMovePlan(scene, 'root-tail', -1)).toEqual({
      kind: 'timeline',
      beforeNodeId: 'if-root',
    });
    expect(getFormNodeMovePlan(scene, 'missing-node', 1)).toBeNull();
  });
});
