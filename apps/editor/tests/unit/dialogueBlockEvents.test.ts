import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import {
  getDialogueFieldUpdate,
  getDroppedNewDialogueBlock,
  getReorderedDialogueBlock,
} from '../../src/renderer/features/block-editor/dialogueBlockEvents';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: '场景 1',
  nodes: [
    {
      id: 'node-1',
      type: 'dialogue',
      speaker: 'A',
      text: '第一句',
    },
    {
      id: 'node-2',
      type: 'dialogue',
      speaker: 'B',
      text: '第二句',
    },
  ],
};

function createMoveEvent(
  blockId: string,
): Blockly.Events.BlockMove {
  return {
    type: Blockly.Events.BLOCK_MOVE,
    blockId,
    reason: ['drag'],
  } as Blockly.Events.BlockMove;
}

function createDialogueBlock(
  id: string,
  nextBlockId: string | null,
  previousBlockId: string | null = null,
): Blockly.BlockSvg {
  return {
    id,
    type: DIALOGUE_BLOCK_TYPE,
    getNextBlock: () =>
      nextBlockId === null
        ? null
        : ({ id: nextBlockId } as Blockly.Block),
    getPreviousBlock: () =>
      previousBlockId === null
        ? null
        : ({ id: previousBlockId } as Blockly.Block),
  } as Blockly.BlockSvg;
}

function createWorkspace(
  block: Blockly.BlockSvg,
): Blockly.WorkspaceSvg {
  return {
    getBlockById: (blockId: string) =>
      blockId === block.id ? block : null,
  } as Blockly.WorkspaceSvg;
}

describe('getDroppedNewDialogueBlock', () => {
  it('uses the connected next scene node as beforeNodeId', () => {
    const block = createDialogueBlock('temporary-block', 'node-2');

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      block,
      beforeNodeId: 'node-2',
    });
  });

  it('appends when the new block is connected after the final scene node', () => {
    const block = createDialogueBlock(
      'temporary-block',
      null,
      'node-2',
    );

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      block,
      beforeNodeId: null,
    });
  });

  it('does not commit a new block that is not touching the scene chain', () => {
    const block = createDialogueBlock('temporary-block', null);

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });

  it('allows an unconnected block to become the first node of an empty scene', () => {
    const block = createDialogueBlock('temporary-block', null);
    const emptyScene: SceneDocument = {
      ...scene,
      nodes: [],
    };

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        emptyScene,
      ),
    ).toEqual({ block, beforeNodeId: null });
  });

  it('ignores blocks that already came from the C++ scene snapshot', () => {
    const block = createDialogueBlock('node-1', 'node-2');

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });

  it('ignores automatic moves that were not caused by a user drag', () => {
    const block = createDialogueBlock('temporary-block', 'node-2');
    const event = createMoveEvent(block.id);
    event.reason = ['bump'];

    expect(
      getDroppedNewDialogueBlock(
        event,
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });
});

describe('getDialogueFieldUpdate', () => {
  function createChangeEvent(blockId: string): Blockly.Events.BlockChange {
    return {
      type: Blockly.Events.BLOCK_CHANGE,
      blockId,
      element: 'field',
      name: 'SPEAKER',
    } as Blockly.Events.BlockChange;
  }

  it('ignores edits on an unconnected temporary block', () => {
    const block = {
      ...createDialogueBlock('temporary-block', null),
      getFieldValue: () => 'Alice',
    } as unknown as Blockly.BlockSvg;

    expect(
      getDialogueFieldUpdate(
        createChangeEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });
});

describe('getReorderedDialogueBlock', () => {
  it('uses the next connected scene node as the arbitrary drop anchor', () => {
    const block = createDialogueBlock('node-2', 'node-1');

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      nodeId: 'node-2',
      beforeNodeId: 'node-1',
    });
  });

  it('uses null when an existing dialogue is dropped at the end', () => {
    const block = createDialogueBlock('node-1', null);

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      nodeId: 'node-1',
      beforeNodeId: null,
    });
  });

  it('ignores a block dropped back at its original position', () => {
    const block = createDialogueBlock('node-1', 'node-2');

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });
});
