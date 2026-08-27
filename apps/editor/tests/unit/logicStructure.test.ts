/**
 * 文件主要作用：验证 flat logic marker structure 的行为。
 * 测试覆盖：`flat logic marker structure`。
 */

import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  flattenLogicStructure,
  getCgDisplayNodeIds,
  getLogicControlNodeIds,
  parseLogicStructure,
} from '../../src/renderer/features/block-editor/logicStructure';

function scene(nodes: SceneDocument['nodes']): SceneDocument {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Scene',
    backgroundAssetId: null,
    nodes,
  };
}

describe('flat logic marker structure', () => {
  const nestedNodes: SceneDocument['nodes'] = [
    {
      id: 'if-1',
      type: 'logicIf',
      condition: {
        left: { kind: 'variable', name: 'score' },
        operator: 'gte',
        right: { kind: 'literal', value: 5 },
      },
    },
    { id: 'repeat-1', type: 'logicRepeat', count: 2 },
    {
      id: 'then-line',
      type: 'dialogue',
      speaker: 'A',
      text: 'Then',
      voiceAssetId: null,
    },
    {
      id: 'repeat-end',
      type: 'logicEndRepeat',
      repeatNodeId: 'repeat-1',
    },
    { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
    {
      id: 'else-line',
      type: 'dialogue',
      speaker: 'B',
      text: 'Else',
      voiceAssetId: null,
    },
    { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
  ];

  it('round-trips nested structures without exposing markers as items', () => {
    const structure = parseLogicStructure(scene(nestedNodes));

    expect(structure).toHaveLength(1);
    expect(structure[0]).toMatchObject({
      kind: 'if',
      node: { id: 'if-1' },
      thenItems: [{ kind: 'repeat', node: { id: 'repeat-1' } }],
      elseItems: [{ kind: 'node', node: { id: 'else-line' } }],
    });
    expect(flattenLogicStructure(structure)).toEqual(nestedNodes);
    expect(getLogicControlNodeIds(scene(nestedNodes), 'if-1')).toEqual(
      nestedNodes.map((node) => node.id),
    );
    expect(getLogicControlNodeIds(scene(nestedNodes), 'repeat-1')).toEqual([
      'repeat-1',
      'then-line',
      'repeat-end',
    ]);
  });

  it('rejects story extensions inside a control scope', () => {
    const invalid: SceneDocument['nodes'] = [
      nestedNodes[0],
      { id: 'extension-1', type: 'storyExtension' },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
    ];
    expect(() => parseLogicStructure(scene(invalid))).toThrow(
      '延伸积木不能放入逻辑积木',
    );
  });

  it('rejects mismatched paired markers instead of guessing branches', () => {
    const invalid: SceneDocument['nodes'] = [
      nestedNodes[0],
      { id: 'else-other', type: 'logicElse', ifNodeId: 'if-other' },
      { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
    ];
    expect(() => parseLogicStructure(scene(invalid))).toThrow(
      '逻辑控制标记不匹配',
    );
  });

  it('round-trips empty and dialogue-only CG ranges nested in logic', () => {
    const nodes: SceneDocument['nodes'] = [
      {
        id: 'if-1',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'A' },
        },
      },
      {
        id: 'cg-1',
        type: 'cgDisplay',
        assetId: 'cg-image',
        leadInMs: 500,
      },
      {
        id: 'cg-line',
        type: 'dialogue',
        speaker: 'A',
        text: 'Inside CG',
        voiceAssetId: null,
      },
      {
        id: 'cg-end-1',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-1',
      },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      {
        id: 'cg-empty',
        type: 'cgDisplay',
        assetId: 'cg-image-2',
        leadInMs: 0,
      },
      {
        id: 'cg-end-empty',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-empty',
      },
      { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
    ];
    const structure = parseLogicStructure(scene(nodes));
    expect(structure[0]).toMatchObject({
      kind: 'if',
      thenItems: [{ kind: 'cg', node: { id: 'cg-1' } }],
      elseItems: [{ kind: 'cg', node: { id: 'cg-empty' }, bodyItems: [] }],
    });
    expect(flattenLogicStructure(structure)).toEqual(nodes);
    expect(getCgDisplayNodeIds(scene(nodes), 'cg-1')).toEqual([
      'cg-1',
      'cg-line',
      'cg-end-1',
    ]);
  });

  it('rejects non-dialogue nodes and nested CG controls inside a CG body', () => {
    const root = {
      id: 'cg-1',
      type: 'cgDisplay' as const,
      assetId: 'cg-image',
      leadInMs: 0,
    };
    expect(() => parseLogicStructure(scene([
      root,
      { id: 'bg-1', type: 'background', assetId: null },
      {
        id: 'cg-end-1',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-1',
      },
    ]))).toThrow('CG 显示积木中只能放置对白');
    expect(() => parseLogicStructure(scene([
      root,
      {
        id: 'cg-2',
        type: 'cgDisplay',
        assetId: 'cg-image-2',
        leadInMs: 0,
      },
      {
        id: 'cg-end-2',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-2',
      },
      {
        id: 'cg-end-1',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-1',
      },
    ]))).toThrow('CG 显示积木中只能放置对白');
  });
});
