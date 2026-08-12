import { describe, expect, it } from 'vitest';

import { isEngineInvocation } from '../../src/main/ipc/validateEngineInvocation';

describe('reorderMany IPC validation', () => {
  it('accepts a unique, non-empty selection and a nullable anchor', () => {
    expect(
      isEngineInvocation({
        method: 'dialogue.reorderMany',
        params: {
          sceneId: 'scene-1',
          nodeIds: ['node-2', 'node-4'],
          beforeNodeId: null,
        },
      }),
    ).toBe(true);

    expect(
      isEngineInvocation({
        method: 'dialogue.reorderMany',
        params: {
          sceneId: 'scene-1',
          nodeIds: ['node-2', 'node-4'],
          beforeNodeId: 'node-5',
        },
      }),
    ).toBe(true);
  });

  it('rejects empty, duplicate, and non-string node IDs', () => {
    for (const nodeIds of [
      [],
      ['node-2', 'node-2'],
      ['node-2', 4],
    ]) {
      expect(
        isEngineInvocation({
          method: 'dialogue.reorderMany',
          params: {
            sceneId: 'scene-1',
            nodeIds,
            beforeNodeId: null,
          },
        }),
      ).toBe(false);
    }
  });

  it('requires beforeNodeId to be a string or null', () => {
    for (const beforeNodeId of [undefined, 3, false]) {
      expect(
        isEngineInvocation({
          method: 'dialogue.reorderMany',
          params: {
            sceneId: 'scene-1',
            nodeIds: ['node-2', 'node-4'],
            beforeNodeId,
          },
        }),
      ).toBe(false);
    }
  });
});
