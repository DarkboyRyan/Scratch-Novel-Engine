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

  it('accepts only the exact title and nullable start screen resources', () => {
    expect(
      isEngineInvocation({
        method: 'startScreen.update',
        params: {
          title: 'Custom title',
          backgroundAssetId: 'image-1',
          musicAssetId: null,
        },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'startScreen.update',
        params: {
          title: 'Custom title',
          backgroundAssetId: null,
          musicAssetId: 'audio-1',
        },
      }),
    ).toBe(true);

    for (const params of [
      { backgroundAssetId: 'image-1' },
      { title: 7, backgroundAssetId: null, musicAssetId: null },
      {
        title: 'Custom title',
        backgroundAssetId: 7,
        musicAssetId: null,
      },
      {
        title: 'Custom title',
        backgroundAssetId: null,
        musicAssetId: false,
      },
      {
        title: 'Custom title',
        backgroundAssetId: null,
        musicAssetId: null,
        sceneId: 'scene-1',
      },
    ]) {
      expect(
        isEngineInvocation({ method: 'startScreen.update', params }),
      ).toBe(false);
    }
  });

  it('accepts only exact non-empty nine-slot CG pages', () => {
    const emptyPage = { imageAssetIds: Array(9).fill(null) };
    const populatedPage = {
      imageAssetIds: ['image-2', null, 'image-1', null, null, null, null, null, null],
    };
    expect(isEngineInvocation({
      method: 'cgGallery.update',
      params: { pages: [emptyPage] },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'cgGallery.update',
      params: { pages: [populatedPage, emptyPage] },
    })).toBe(true);

    for (const params of [
      {},
      { pages: [] },
      { pages: 'page-1' },
      { pages: [{ imageAssetIds: Array(8).fill(null) }] },
      { pages: [{ imageAssetIds: [2, ...Array(8).fill(null)] }] },
      {
        pages: [
          { imageAssetIds: ['image-1', ...Array(8).fill(null)] },
          { imageAssetIds: ['image-1', ...Array(8).fill(null)] },
        ],
      },
      { pages: [emptyPage], unexpected: true },
    ]) {
      expect(isEngineInvocation({
        method: 'cgGallery.update',
        params,
      })).toBe(false);
    }
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
          position: { x: 37.5, y: 92 },
        },
      }),
    ).toBe(true);

    for (const invalid of [
      { assetId: null, slot: 'top', layer: 1, position: null },
      { assetId: null, slot: 'left', layer: 0, position: null },
      { assetId: null, slot: 'right', layer: 1.5, position: null },
      { assetId: null, slot: 'center', layer: 1, position: { x: -1, y: 50 } },
      { assetId: null, slot: 'center', layer: 1, position: { x: 50, y: 101 } },
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

  it('validates scene jump creation and target updates', () => {
    expect(isEngineInvocation({
      method: 'sceneJump.add',
      params: {
        sceneId: 'scene-1',
        targetSceneId: 'scene-2',
        afterNodeId: 'node-1',
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'sceneJump.update',
      params: {
        sceneId: 'scene-1',
        nodeId: 'jump-1',
        targetSceneId: 'scene-2',
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'sceneJump.add',
      params: { sceneId: 'scene-1' },
    })).toBe(false);
    expect(isEngineInvocation({
      method: 'sceneJump.add',
      params: {
        sceneId: 'scene-1',
        targetSceneId: 'scene-2',
        afterNodeId: 'a',
        beforeNodeId: 'b',
      },
    })).toBe(false);
  });

  it('validates story extension insertion anchors', () => {
    for (const placement of [
      {},
      { afterNodeId: 'dialogue-1' },
      { beforeNodeId: 'dialogue-2' },
    ]) {
      expect(isEngineInvocation({
        method: 'storyExtension.add',
        params: { sceneId: 'scene-1', ...placement },
      })).toBe(true);
    }

    for (const params of [
      {},
      { sceneId: 'scene-1', beforeNodeId: 7 },
      {
        sceneId: 'scene-1',
        afterNodeId: 'dialogue-1',
        beforeNodeId: 'dialogue-2',
      },
    ]) {
      expect(isEngineInvocation({
        method: 'storyExtension.add',
        params,
      })).toBe(false);
    }
  });

  it('validates dialogue voice and BGM commands with nullable audio IDs', () => {
    for (const method of ['dialogue.setVoice', 'bgm.update']) {
      for (const assetId of ['audio-1', null]) {
        expect(isEngineInvocation({
          method,
          params: {
            sceneId: 'scene-1',
            nodeId: method === 'bgm.update' ? 'bgm-1' : 'dialogue-1',
            assetId,
          },
        })).toBe(true);
      }
      expect(isEngineInvocation({
        method,
        params: {
          sceneId: 'scene-1',
          nodeId: 'node-1',
          assetId: 7,
        },
      })).toBe(false);
    }

    expect(isEngineInvocation({
      method: 'bgm.add',
      params: { sceneId: 'scene-1', afterNodeId: 'dialogue-1' },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'bgm.add',
      params: {
        sceneId: 'scene-1',
        afterNodeId: 'a',
        beforeNodeId: 'b',
      },
    })).toBe(false);
  });

  it('validates empty video creation and nullable video updates', () => {
    for (const placement of [
      {},
      { afterNodeId: 'dialogue-1' },
      { beforeNodeId: 'background-1' },
      { afterNodeId: null },
    ]) {
      expect(isEngineInvocation({
        method: 'video.add',
        params: { sceneId: 'scene-1', ...placement },
      })).toBe(true);
    }

    expect(isEngineInvocation({
      method: 'video.add',
      params: { sceneId: 'scene-1', assetId: 'video-1' },
    })).toBe(false);
    expect(isEngineInvocation({
      method: 'video.add',
      params: {
        sceneId: 'scene-1',
        afterNodeId: 'a',
        beforeNodeId: 'b',
      },
    })).toBe(false);

    for (const assetId of ['video-1', null]) {
      expect(isEngineInvocation({
        method: 'video.update',
        params: { sceneId: 'scene-1', nodeId: 'video-node-1', assetId },
      })).toBe(true);
    }
    expect(isEngineInvocation({
      method: 'video.update',
      params: { sceneId: 'scene-1', nodeId: 'video-node-1', assetId: 7 },
    })).toBe(false);
  });

  it('validates choice containers and nested option mutations', () => {
    expect(isEngineInvocation({
      method: 'choice.add',
      params: { sceneId: 'scene-1', afterNodeId: 'dialogue-1' },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'choice.add',
      params: {
        sceneId: 'scene-1',
        afterNodeId: 'dialogue-1',
        beforeNodeId: 'video-1',
      },
    })).toBe(false);

    expect(isEngineInvocation({
      method: 'choice.option.add',
      params: {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        text: '打开门',
        targetSceneId: 'scene-2',
        beforeOptionId: null,
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'choice.option.update',
      params: {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        optionId: 'option-1',
        text: '离开',
        targetSceneId: 'scene-3',
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'choice.option.delete',
      params: {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        optionId: 'option-1',
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'choice.option.reorder',
      params: {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        optionId: 'option-2',
        beforeOptionId: 'option-1',
      },
    })).toBe(true);

    for (const invocation of [
      {
        method: 'choice.option.add',
        params: {
          sceneId: 'scene-1',
          nodeId: 'choice-1',
          text: 5,
          targetSceneId: 'scene-2',
        },
      },
      {
        method: 'choice.option.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'choice-1',
          optionId: 'option-1',
          text: '离开',
          targetSceneId: null,
        },
      },
      {
        method: 'choice.option.reorder',
        params: {
          sceneId: 'scene-1',
          nodeId: 'choice-1',
          optionId: 'option-1',
        },
      },
    ]) {
      expect(isEngineInvocation(invocation)).toBe(false);
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
