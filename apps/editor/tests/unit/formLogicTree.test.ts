import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import { createFormLogicTree } from '../../src/renderer/features/form-editor/formLogicTree';

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
          id: 'else-line',
          type: 'dialogue',
          speaker: 'B',
          text: 'Else',
          voiceAssetId: null,
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
      'else-line@2',
    ]);
    expect(JSON.stringify(entries)).not.toContain('logicElse');
    expect(JSON.stringify(entries)).not.toContain('logicEndIf');
    expect(JSON.stringify(entries)).not.toContain('logicEndRepeat');
    expect(JSON.stringify(entries)).not.toContain('storyExtension');
  });
});
