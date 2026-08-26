import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  flattenLogicStructure,
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
});
