/**
 * 文件主要作用：验证 story continuation sequence commands 的行为。
 * 测试覆盖：`story continuation sequence commands`。
 */

import type * as Blockly from 'blockly';
import { describe, expect, it, vi } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  STORY_CONTINUATION_BLOCK_FIELDS,
  STORY_CONTINUATION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/storyContinuationBlock';
import {
  buildStoryContinuationPageReorder,
  collectStoryContinuationSequenceDraft,
  getStoryContinuationSequenceUpdate,
  type StoryContinuationSequenceResolution,
} from '../../src/renderer/features/block-editor/storyContinuationBlockEvents';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-with-three-extensions',
  name: '长场景',
  backgroundAssetId: null,
  nodes: [
    {
      id: 'dialogue-a',
      type: 'dialogue',
      speaker: 'A',
      text: 'A',
      voiceAssetId: null,
    },
    { id: 'extension-1', type: 'storyExtension' },
    {
      id: 'dialogue-b',
      type: 'dialogue',
      speaker: 'B',
      text: 'B',
      voiceAssetId: null,
    },
    {
      id: 'jump-1',
      type: 'sceneJump',
      targetSceneId: 'target-scene',
    },
    {
      id: 'dialogue-after-jump',
      type: 'dialogue',
      speaker: 'C',
      text: '跳转后的作者节点',
      voiceAssetId: null,
    },
    { id: 'extension-2', type: 'storyExtension' },
    {
      id: 'dialogue-d',
      type: 'dialogue',
      speaker: 'D',
      text: 'D',
      voiceAssetId: null,
    },
    { id: 'extension-3', type: 'storyExtension' },
    {
      id: 'dialogue-e',
      type: 'dialogue',
      speaker: 'E',
      text: 'E',
      voiceAssetId: null,
    },
  ],
};

const nestedLogicPageNodeIds = [
  'extension-logic',
  'if-logic',
  'then-line',
  'repeat-logic',
  'repeat-line',
  'endrepeat-logic',
  'else-logic',
  'else-line',
  'endif-logic',
  'after-logic',
];

const sceneWithNestedLogicPage: SceneDocument = {
  ...scene,
  id: 'scene-with-nested-logic-page',
  nodes: [
    { id: 'extension-before', type: 'storyExtension' },
    {
      id: 'before-line',
      type: 'dialogue',
      speaker: 'A',
      text: 'Before',
      voiceAssetId: null,
    },
    { id: 'extension-logic', type: 'storyExtension' },
    {
      id: 'if-logic',
      type: 'logicIf',
      condition: {
        left: { kind: 'variable', name: 'route' },
        operator: 'eq',
        right: { kind: 'literal', value: 'A' },
      },
    },
    {
      id: 'then-line',
      type: 'dialogue',
      speaker: 'B',
      text: 'Then',
      voiceAssetId: null,
    },
    { id: 'repeat-logic', type: 'logicRepeat', count: 2 },
    {
      id: 'repeat-line',
      type: 'dialogue',
      speaker: 'C',
      text: 'Repeat',
      voiceAssetId: null,
    },
    {
      id: 'endrepeat-logic',
      type: 'logicEndRepeat',
      repeatNodeId: 'repeat-logic',
    },
    { id: 'else-logic', type: 'logicElse', ifNodeId: 'if-logic' },
    {
      id: 'else-line',
      type: 'dialogue',
      speaker: 'D',
      text: 'Else',
      voiceAssetId: null,
    },
    { id: 'endif-logic', type: 'logicEndIf', ifNodeId: 'if-logic' },
    {
      id: 'after-logic',
      type: 'dialogue',
      speaker: 'E',
      text: 'After logic',
      voiceAssetId: null,
    },
    { id: 'extension-after', type: 'storyExtension' },
    {
      id: 'after-line',
      type: 'dialogue',
      speaker: 'F',
      text: 'After page',
      voiceAssetId: null,
    },
    { id: 'extension-tail', type: 'storyExtension' },
    {
      id: 'tail-line',
      type: 'dialogue',
      speaker: 'G',
      text: 'Tail',
      voiceAssetId: null,
    },
  ],
};

function extensionBlock(
  id: string,
  sequence: number,
): Blockly.Block {
  return {
    id,
    type: STORY_CONTINUATION_BLOCK_TYPE,
    getFieldValue: (name: string) =>
      name === STORY_CONTINUATION_BLOCK_FIELDS.sequence
        ? sequence
        : null,
  } as unknown as Blockly.Block;
}

function workspaceWith(
  ...blocks: Blockly.Block[]
): Blockly.WorkspaceSvg {
  return {
    getBlockById: (id: string) =>
      blocks.find((block) => block.id === id) ?? null,
  } as Blockly.WorkspaceSvg;
}

function sequenceChangeEvent(
  blockId: string,
): Blockly.Events.BlockChange {
  return {
    type: 'change',
    blockId,
    element: 'field',
    name: STORY_CONTINUATION_BLOCK_FIELDS.sequence,
  } as Blockly.Events.BlockChange;
}

function sendOnlyReorderRequests(
  resolution: StoryContinuationSequenceResolution | null,
  reorderMany: ReturnType<typeof vi.fn>,
): void {
  if (resolution?.kind === 'reorder-page') {
    reorderMany(resolution.params);
  }
}

describe('story continuation sequence commands', () => {
  it('moves the complete extension segment earlier as one request', () => {
    expect(
      buildStoryContinuationPageReorder(scene, 'extension-3', 1),
    ).toEqual({
      kind: 'reorder-page',
      params: {
        sceneId: scene.id,
        nodeIds: ['extension-3', 'dialogue-e'],
        beforeNodeId: 'extension-1',
      },
    });
  });

  it('moves the complete extension segment later, including nodes after a scene jump', () => {
    expect(
      buildStoryContinuationPageReorder(scene, 'extension-1', 3),
    ).toEqual({
      kind: 'reorder-page',
      params: {
        sceneId: scene.id,
        nodeIds: [
          'extension-1',
          'dialogue-b',
          'jump-1',
          'dialogue-after-jump',
        ],
        beforeNodeId: null,
      },
    });
  });

  it.each([
    { direction: 'earlier', targetSequence: 1, beforeNodeId: 'extension-before' },
    { direction: 'later', targetSequence: 3, beforeNodeId: 'extension-tail' },
  ])('moves a page with nested If/Repeat $direction as one complete flat segment', ({
    targetSequence,
    beforeNodeId,
  }) => {
    const block = extensionBlock('extension-logic', targetSequence);
    const resolution = getStoryContinuationSequenceUpdate(
      sequenceChangeEvent(block.id),
      workspaceWith(block),
      sceneWithNestedLogicPage,
    );
    const reorderMany = vi.fn();

    sendOnlyReorderRequests(resolution, reorderMany);

    expect(reorderMany).toHaveBeenCalledOnce();
    expect(reorderMany).toHaveBeenCalledWith({
      sceneId: sceneWithNestedLogicPage.id,
      nodeIds: nestedLogicPageNodeIds,
      beforeNodeId,
    });
    expect(nestedLogicPageNodeIds).not.toContain(beforeNodeId);
  });

  it('treats the current sequence as a no-op without issuing reorder IPC', () => {
    const reorderMany = vi.fn();
    const resolution = buildStoryContinuationPageReorder(
      scene,
      'extension-2',
      2,
    );

    sendOnlyReorderRequests(resolution, reorderMany);

    expect(resolution).toBeNull();
    expect(reorderMany).not.toHaveBeenCalled();
  });

  it.each([0, 4, 1.5, Number.NaN])(
    'restores an invalid sequence %s without issuing reorder IPC',
    (targetSequence) => {
      const reorderMany = vi.fn();
      const resolution = buildStoryContinuationPageReorder(
        scene,
        'extension-2',
        targetSequence,
      );

      sendOnlyReorderRequests(resolution, reorderMany);

      expect(resolution).toEqual({ kind: 'restore-projection' });
      expect(reorderMany).not.toHaveBeenCalled();
    },
  );

  it('translates a sequence field edit into the atomic page request', () => {
    const block = extensionBlock('extension-2', 1);

    expect(
      getStoryContinuationSequenceUpdate(
        sequenceChangeEvent(block.id),
        workspaceWith(block),
        scene,
      ),
    ).toEqual({
      kind: 'reorder-page',
      params: {
        sceneId: scene.id,
        nodeIds: ['extension-2', 'dialogue-d'],
        beforeNodeId: 'extension-1',
      },
    });
  });

  it('reads an invalid focused draft as a restoration command', () => {
    const first = extensionBlock('extension-1', 1);
    const second = extensionBlock('extension-2', 99);
    const third = extensionBlock('extension-3', 3);

    expect(
      collectStoryContinuationSequenceDraft(
        workspaceWith(first, second, third),
        scene,
      ),
    ).toEqual({ kind: 'restore-projection' });
  });
});
