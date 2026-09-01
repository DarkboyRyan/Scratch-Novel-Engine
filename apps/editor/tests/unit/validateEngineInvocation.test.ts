/**
 * 文件主要作用：验证 engine IPC validation 的行为。
 * 测试覆盖：`engine IPC validation`。
 */

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
          eyebrow: 'A CUSTOM STORY',
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
          eyebrow: '',
          backgroundAssetId: null,
          musicAssetId: 'audio-1',
        },
      }),
    ).toBe(true);

    for (const params of [
      { backgroundAssetId: 'image-1' },
      {
        title: 'Custom title',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      {
        title: 7,
        eyebrow: 'A CUSTOM STORY',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      {
        title: 'Custom title',
        eyebrow: 7,
        backgroundAssetId: null,
        musicAssetId: null,
      },
      {
        title: 'Custom title',
        eyebrow: 'a'.repeat(257),
        backgroundAssetId: null,
        musicAssetId: null,
      },
      {
        title: 'Custom title',
        eyebrow: 'BAD\0COPY',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      {
        title: 'Custom title',
        eyebrow: '\ud800',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      {
        title: 'Custom title',
        eyebrow: 'A CUSTOM STORY',
        backgroundAssetId: 7,
        musicAssetId: null,
      },
      {
        title: 'Custom title',
        eyebrow: 'A CUSTOM STORY',
        backgroundAssetId: null,
        musicAssetId: false,
      },
      {
        title: 'Custom title',
        eyebrow: 'A CUSTOM STORY',
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
        params: {
          sceneId: 'scene-1',
          assetId: 'asset-1',
          scalePercent: 80,
        },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'scene.setBackground',
        params: { sceneId: 'scene-1', assetId: null, scalePercent: 100 },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'scene.setBackground',
        params: { sceneId: 'scene-1', assetId: 3, scalePercent: 100 },
      }),
    ).toBe(false);
    for (const params of [
      { sceneId: 'scene-1', assetId: 'asset-1' },
      { sceneId: 'scene-1', assetId: 'asset-1', scalePercent: 9 },
      { sceneId: 'scene-1', assetId: 'asset-1', scalePercent: 301 },
      { sceneId: 'scene-1', assetId: null, scalePercent: 80 },
    ]) {
      expect(isEngineInvocation({
        method: 'scene.setBackground',
        params,
      })).toBe(false);
    }
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
          scalePercent: 80,
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
          scalePercent: 100,
        },
      }),
    ).toBe(true);
    for (const params of [
      {
        sceneId: 'scene-1',
        nodeId: 'background-1',
        assetId: 'asset-2',
      },
      {
        sceneId: 'scene-1',
        nodeId: 'background-1',
        assetId: 'asset-2',
        scalePercent: 9,
      },
      {
        sceneId: 'scene-1',
        nodeId: 'background-1',
        assetId: null,
        scalePercent: 80,
      },
    ]) {
      expect(isEngineInvocation({
        method: 'background.update',
        params,
      })).toBe(false);
    }

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
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'character.add',
        params: { sceneId: 'scene-1', mode: 'show', assetId: null },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'character.add',
        params: { sceneId: 'scene-1', mode: 'clear', assetId: null },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'character.add',
        params: { sceneId: 'scene-1', mode: 'clear', assetId: 'asset-1' },
      }),
    ).toBe(false);
    expect(
      isEngineInvocation({
        method: 'character.add',
        params: { sceneId: 'scene-1', mode: 'placeholder' },
      }),
    ).toBe(false);
    expect(
      isEngineInvocation({
        method: 'character.add',
        params: { sceneId: 'scene-1', slot: 'left' },
      }),
    ).toBe(false);
    expect(
      isEngineInvocation({
        method: 'character.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'character-1',
          mode: 'show',
          assetId: null,
          slot: 'center',
          layer: 10,
          position: { x: 37.5, y: 92 },
          scalePercent: 125,
        },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'character.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'character-1',
          mode: 'clear',
          assetId: null,
          slot: 'center',
          layer: 10,
          position: null,
          scalePercent: 100,
        },
      }),
    ).toBe(true);
    expect(
      isEngineInvocation({
        method: 'character.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'character-1',
          mode: 'clear',
          assetId: null,
          slot: 'center',
          layer: 10,
          position: { x: 50, y: 90 },
          scalePercent: 100,
        },
      }),
    ).toBe(false);

    for (const invalid of [
      { assetId: null, slot: 'top', layer: 1, position: null, scalePercent: 100 },
      { assetId: null, slot: 'left', layer: 0, position: null, scalePercent: 100 },
      { assetId: null, slot: 'right', layer: 1.5, position: null, scalePercent: 100 },
      { assetId: null, slot: 'center', layer: 1, position: { x: -1, y: 50 }, scalePercent: 100 },
      { assetId: null, slot: 'center', layer: 1, position: { x: 50, y: 101 }, scalePercent: 100 },
      { assetId: 'image-1', slot: 'center', layer: 1, position: null, scalePercent: 9 },
      { assetId: 'image-1', slot: 'center', layer: 1, position: null, scalePercent: 301 },
      { mode: 'clear', assetId: null, slot: 'center', layer: 1, position: null, scalePercent: 125 },
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

    expect(
      isEngineInvocation({
        method: 'character.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'character-1',
          assetId: 'image-1',
          slot: 'left',
          layer: 1,
          position: null,
          scalePercent: 100,
          effect: null,
        },
      }),
    ).toBe(false);
  });

  it('validates strict character-effect update and move commands', () => {
    const slideIn = {
      type: 'slideIn',
      durationMs: 500,
      intensity: 'normal',
      direction: 'right',
    };
    expect(isEngineInvocation({
      method: 'characterEffect.update',
      params: {
        sceneId: 'scene-1',
        nodeId: 'character-1',
        effect: null,
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'characterEffect.update',
      params: {
        sceneId: 'scene-1',
        nodeId: 'character-1',
        effect: { type: 'shake', durationMs: 100, intensity: 'strong' },
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'characterEffect.move',
      params: {
        sceneId: 'scene-1',
        fromNodeId: 'character-1',
        toNodeId: 'character-2',
        effect: slideIn,
      },
    })).toBe(true);

    for (const effect of [
      undefined,
      { type: 'shake', durationMs: 99, intensity: 'normal' },
      { type: 'shake', durationMs: 100.5, intensity: 'normal' },
      { type: 'shake', durationMs: 100, intensity: 'loud' },
      { type: 'fadeIn', durationMs: 500, intensity: 'normal' },
      { type: 'slideIn', durationMs: 500, intensity: 'normal' },
      { ...slideIn, direction: 'diagonal' },
      { ...slideIn, unexpected: true },
    ]) {
      expect(isEngineInvocation({
        method: 'characterEffect.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'character-1',
          effect,
        },
      })).toBe(false);
    }

    expect(isEngineInvocation({
      method: 'characterEffect.move',
      params: {
        sceneId: 'scene-1',
        fromNodeId: 'character-1',
        toNodeId: 'character-2',
        effect: null,
      },
    })).toBe(false);
    expect(isEngineInvocation({
      method: 'characterEffect.move',
      params: {
        sceneId: 'scene-1',
        fromNodeId: 'character-1',
        toNodeId: 'character-2',
        effect: slideIn,
        unexpected: true,
      },
    })).toBe(false);
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

  it('validates the exact logic command AST and UTF-8 limits', () => {
    const condition = {
      left: { kind: 'variable', name: '好感度' },
      operator: 'gte',
      right: { kind: 'literal', value: 3 },
    };
    expect(isEngineInvocation({
      method: 'logicIf.add',
      params: { sceneId: 'scene-1', condition, beforeNodeId: 'node-2' },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'variableSet.add',
      params: {
        sceneId: 'scene-1',
        variableName: '好感度',
        value: '高',
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'variableChange.update',
      params: {
        sceneId: 'scene-1',
        nodeId: 'change-1',
        variableName: '好感度',
        amount: -1,
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'logicRepeat.add',
      params: { sceneId: 'scene-1', count: 1000 },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'logicControl.reorder',
      params: { sceneId: 'scene-1', nodeId: 'if-1', beforeNodeId: null },
    })).toBe(true);

    for (const invocation of [
      {
        method: 'variableSet.add',
        params: { sceneId: 'scene-1', variableName: ' route', value: true },
      },
      {
        method: 'variableSet.add',
        params: { sceneId: 'scene-1', variableName: 'route' },
      },
      {
        method: 'variableSet.add',
        params: { sceneId: 'scene-1', variableName: 'bad\0name', value: true },
      },
      {
        method: 'variableSet.add',
        params: { sceneId: 'scene-1', variableName: '界'.repeat(22), value: true },
      },
      {
        method: 'variableSet.add',
        params: {
          sceneId: 'scene-1',
          variableName: 'text',
          value: '界'.repeat(1366),
        },
      },
      {
        method: 'variableChange.add',
        params: { sceneId: 'scene-1', variableName: 'score', amount: Number.NaN },
      },
      {
        method: 'logicIf.add',
        params: {
          sceneId: 'scene-1',
          condition: { ...condition, operator: 'contains' },
        },
      },
      {
        method: 'logicIf.add',
        params: { sceneId: 'scene-1', condition, evil: true },
      },
      {
        method: 'logicRepeat.update',
        params: { sceneId: 'scene-1', nodeId: 'repeat-1', count: 0 },
      },
      {
        method: 'logicControl.delete',
        params: { sceneId: 'scene-1', nodeId: 'if-1', evil: true },
      },
    ]) {
      expect(isEngineInvocation(invocation)).toBe(false);
    }
  });

  it('validates exact CG display commands and millisecond lead-ins', () => {
    expect(isEngineInvocation({
      method: 'cgDisplay.add',
      params: {
        sceneId: 'scene-1',
        assetId: 'image-1',
        leadInMs: 0,
        beforeNodeId: 'dialogue-1',
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'cgDisplay.update',
      params: {
        sceneId: 'scene-1',
        nodeId: 'cg-display-1',
        assetId: 'image-2',
        leadInMs: 60000,
      },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'cgDisplay.delete',
      params: { sceneId: 'scene-1', nodeId: 'cg-display-1' },
    })).toBe(true);
    expect(isEngineInvocation({
      method: 'cgDisplay.reorder',
      params: {
        sceneId: 'scene-1',
        nodeId: 'cg-display-1',
        beforeNodeId: null,
      },
    })).toBe(true);

    for (const invocation of [
      {
        method: 'cgDisplay.add',
        params: { sceneId: 'scene-1', assetId: 'image-1', leadInMs: -1 },
      },
      {
        method: 'cgDisplay.add',
        params: { sceneId: 'scene-1', assetId: 'image-1', leadInMs: 1.5 },
      },
      {
        method: 'cgDisplay.add',
        params: {
          sceneId: 'scene-1',
          assetId: 'image-1',
          leadInMs: 60001,
        },
      },
      {
        method: 'cgDisplay.add',
        params: { sceneId: 'scene-1', leadInMs: 0 },
      },
      {
        method: 'cgDisplay.add',
        params: { sceneId: 'scene-1', assetId: '', leadInMs: 0 },
      },
      {
        method: 'cgDisplay.add',
        params: {
          sceneId: 'scene-1',
          assetId: 'image-1',
          leadInMs: 0,
          afterNodeId: 'a',
          beforeNodeId: 'b',
        },
      },
      {
        method: 'cgDisplay.update',
        params: {
          sceneId: 'scene-1',
          nodeId: 'cg-display-1',
          assetId: 'image-1',
          leadInMs: 0,
          unexpected: true,
        },
      },
      {
        method: 'cgDisplay.reorder',
        params: { sceneId: 'scene-1', nodeId: 'cg-display-1' },
      },
    ]) {
      expect(isEngineInvocation(invocation)).toBe(false);
    }
  });
});
