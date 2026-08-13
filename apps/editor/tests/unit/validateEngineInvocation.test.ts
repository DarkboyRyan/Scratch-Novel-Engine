import { describe, expect, it } from 'vitest';

import { isEngineInvocation } from '../../src/main/ipc/validateEngineInvocation';

describe('engine IPC validation', () => {
  it('keeps project.create off the general Renderer engine channel', () => {
    expect(
      isEngineInvocation({
        method: 'project.create',
        params: { name: '绕过文件会话' },
      }),
    ).toBe(false);
  });

  it('accepts project.rename only with a string name', () => {
    expect(
      isEngineInvocation({
        method: 'project.rename',
        params: { name: 'New name' },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'project.rename',
        params: { name: 7 },
      }),
    ).toBe(false);
  });

  it('accepts setting or clearing a scene background by Asset ID', () => {
    expect(
      isEngineInvocation({
        method: 'scene.setBackground',
        params: { sceneId: 'scene-1', assetId: 'asset-1' },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'scene.setBackground',
        params: { sceneId: 'scene-1', assetId: null },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'scene.setBackground',
        params: { sceneId: 'scene-1', assetId: 3 },
      }),
    ).toBe(false);
  });

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

  it('accepts a background insertion with one optional placement anchor', () => {
    for (const placement of [
      {},
      { afterNodeId: 'node-1' },
      { beforeNodeId: 'node-2' },
      { afterNodeId: null },
    ]) {
      expect(
        isEngineInvocation({
          method: 'background.add',
          params: {
            sceneId: 'scene-1',
            ...placement,
          },
        }),
      ).toBe(true);
    }
  });

  it('rejects malformed or conflicting background insertion params', () => {
    for (const params of [
      {},
      { sceneId: 'scene-1', assetId: 3 },
      {
        sceneId: 'scene-1',
        afterNodeId: 3,
      },
      {
        sceneId: 'scene-1',
        afterNodeId: 'node-1',
        beforeNodeId: 'node-2',
      },
    ]) {
      expect(
        isEngineInvocation({
          method: 'background.add',
          params,
        }),
      ).toBe(false);
    }
  });

  it('validates background update and delete identifiers', () => {
    expect(
      isEngineInvocation({
        method: 'background.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'background-1',
          assetId: 'asset-2',
        },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'background.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'background-1',
          assetId: null,
        },
      }),
    ).toBe(true);

    expect(
      isEngineInvocation({
        method: 'background.delete',
        params: {
          sceneId: 'scene-1',
          nodeId: 'background-1',
        },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'background.delete',
        params: {
          sceneId: 'scene-1',
          nodeId: 4,
        },
      }),
    ).toBe(false);
  });

  it('validates character creation defaults and complete updates', () => {
    expect(
      isEngineInvocation({
        method: 'character.add',
        params: { sceneId: 'scene-1', afterNodeId: 'node-1' },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'character.add',
        params: { sceneId: 'scene-1', assetId: 'asset-1' },
      }),
    ).toBe(false);
    expect(
      isEngineInvocation({
        method: 'character.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'character-1',
          assetId: null,
          slot: 'center',
          layer: 10,
        },
      }),
    ).toBe(true);

    for (const invalid of [
      { assetId: null, slot: 'top', layer: 1 },
      { assetId: null, slot: 'left', layer: 0 },
      { assetId: null, slot: 'right', layer: 1.5 },
    ]) {
      expect(
        isEngineInvocation({
          method: 'character.update',
          params: {
            sceneId: 'scene-1',
            nodeId: 'character-1',
            ...invalid,
          },
        }),
      ).toBe(false);
    }
  });

  it('requires a nullable or string anchor when reordering a background', () => {
    for (const beforeNodeId of [null, 'node-3']) {
      expect(
        isEngineInvocation({
          method: 'background.reorder',
          params: {
            sceneId: 'scene-1',
            nodeId: 'background-1',
            beforeNodeId,
          },
        }),
      ).toBe(true);
    }

    for (const beforeNodeId of [undefined, 3, false]) {
      expect(
        isEngineInvocation({
          method: 'background.reorder',
          params: {
            sceneId: 'scene-1',
            nodeId: 'background-1',
            beforeNodeId,
          },
        }),
      ).toBe(false);
    }
  });

  it('accepts unique mixed timeline selections for atomic deletion', () => {
    expect(
      isEngineInvocation({
        method: 'timeline.deleteMany',
        params: {
          sceneId: 'scene-1',
          nodeIds: ['dialogue-1', 'background-1'],
        },
      }),
    ).toBe(true);

    for (const nodeIds of [
      [],
      ['background-1', 'background-1'],
      ['dialogue-1', 5],
    ]) {
      expect(
        isEngineInvocation({
          method: 'timeline.deleteMany',
          params: { sceneId: 'scene-1', nodeIds },
        }),
      ).toBe(false);
    }
  });

  it('validates single and grouped timeline reorder anchors', () => {
    expect(
      isEngineInvocation({
        method: 'timeline.reorder',
        params: {
          sceneId: 'scene-1',
          nodeId: 'background-1',
          beforeNodeId: 'dialogue-2',
        },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'timeline.reorderMany',
        params: {
          sceneId: 'scene-1',
          nodeIds: ['dialogue-1', 'background-1'],
          beforeNodeId: null,
        },
      }),
    ).toBe(true);

    expect(
      isEngineInvocation({
        method: 'timeline.reorder',
        params: {
          sceneId: 'scene-1',
          nodeId: 'background-1',
        },
      }),
    ).toBe(false);
    expect(
      isEngineInvocation({
        method: 'timeline.reorderMany',
        params: {
          sceneId: 'scene-1',
          nodeIds: ['dialogue-1'],
          beforeNodeId: false,
        },
      }),
    ).toBe(false);
  });
});
