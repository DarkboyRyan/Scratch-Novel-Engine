/**
 * 文件主要作用：验证 choice option Blockly events 的行为。
 * 测试覆盖：`choice option Blockly events`。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_FIELDS,
  CHOICE_OPTION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import {
  collectChoiceOptionFieldDrafts,
  findChoiceOption,
  getChoiceOptionFieldUpdate,
  getNewChoiceOptionDropResolution,
  getReorderedChoiceOptionBlock,
  isChoiceOptionOutsideOwningChoice,
} from '../../src/renderer/features/block-editor/choiceBlockEvents';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: '场景 1',
  backgroundAssetId: null,
  nodes: [
    {
      id: 'choice-1',
      type: 'choice',
      options: [
        { id: 'option-1', text: '留下', targetSceneId: 'scene-1' },
        { id: 'option-2', text: '离开', targetSceneId: 'scene-2' },
      ],
    },
    {
      id: 'choice-2',
      type: 'choice',
      options: [],
    },
  ],
};

function createMoveEvent(blockId: string): Blockly.Events.BlockMove {
  return {
    type: Blockly.Events.BLOCK_MOVE,
    blockId,
    reason: ['drag'],
  } as Blockly.Events.BlockMove;
}

function createOptionBlock({
  id,
  parentId = 'choice-1',
  nextId = null,
  text = '新选项',
  targetSceneId = 'scene-2',
}: {
  id: string;
  parentId?: string | null;
  nextId?: string | null;
  text?: string;
  targetSceneId?: string;
}): Blockly.BlockSvg {
  return {
    id,
    type: CHOICE_OPTION_BLOCK_TYPE,
    getSurroundParent: () =>
      parentId === null
        ? null
        : ({ id: parentId, type: CHOICE_BLOCK_TYPE } as Blockly.Block),
    getNextBlock: () =>
      nextId === null
        ? null
        : ({ id: nextId } as Blockly.Block),
    getFieldValue: (fieldName: string) =>
      fieldName === CHOICE_OPTION_BLOCK_FIELDS.text
        ? text
        : targetSceneId,
  } as Blockly.BlockSvg;
}

function createWorkspace(
  blocks: Blockly.BlockSvg[],
): Blockly.WorkspaceSvg {
  return {
    getBlockById: (blockId: string) =>
      blocks.find((block) => block.id === blockId) ?? null,
  } as Blockly.WorkspaceSvg;
}

describe('choice option Blockly events', () => {
  it('finds a nested option together with its owning ChoiceNode', () => {
    const location = findChoiceOption(scene, 'option-2');

    expect(location?.node.id).toBe('choice-1');
    expect(location?.option.text).toBe('离开');
    expect(location?.optionIndex).toBe(1);
    expect(findChoiceOption(scene, 'missing')).toBeNull();
  });

  it('translates persisted text and scene dropdown changes', () => {
    const block = createOptionBlock({
      id: 'option-1',
      text: '继续前进',
      targetSceneId: 'scene-2',
    });
    const event = {
      type: Blockly.Events.BLOCK_CHANGE,
      blockId: block.id,
      element: 'field',
      name: CHOICE_OPTION_BLOCK_FIELDS.text,
    } as Blockly.Events.BlockChange;

    expect(
      getChoiceOptionFieldUpdate(
        event,
        createWorkspace([block]),
        scene,
      ),
    ).toEqual({
      nodeId: 'choice-1',
      optionId: 'option-1',
      text: '继续前进',
      targetSceneId: 'scene-2',
    });
  });

  it('collects focused field drafts before project save', () => {
    const first = createOptionBlock({
      id: 'option-1',
      text: '留下',
      targetSceneId: 'scene-1',
    });
    const second = createOptionBlock({
      id: 'option-2',
      text: '马上离开',
      targetSceneId: 'scene-2',
    });

    expect(
      collectChoiceOptionFieldDrafts(
        createWorkspace([first, second]),
        scene,
      ),
    ).toEqual([
      {
        nodeId: 'choice-1',
        optionId: 'option-2',
        text: '马上离开',
        targetSceneId: 'scene-2',
      },
    ]);
  });

  it('adds a temporary option at its nested visual position', () => {
    const block = createOptionBlock({
      id: 'temporary-option',
      nextId: 'option-2',
    });

    expect(
      getNewChoiceOptionDropResolution(
        createMoveEvent(block.id),
        createWorkspace([block]),
        scene,
      ),
    ).toEqual({
      kind: 'add',
      drop: {
        block,
        nodeId: 'choice-1',
        text: '新选项',
        targetSceneId: 'scene-2',
        beforeOptionId: 'option-2',
      },
    });
  });

  it('rolls back a new option dropped on blank canvas', () => {
    const block = createOptionBlock({
      id: 'temporary-option',
      parentId: null,
    });

    expect(
      getNewChoiceOptionDropResolution(
        createMoveEvent(block.id),
        createWorkspace([block]),
        scene,
      ),
    ).toEqual({ kind: 'rollback' });
  });

  it('rolls back a new option inserted into the top-level story chain', () => {
    // Statement blocks connected in a top-level next/previous chain still
    // have no surround parent. This is distinct from a valid Choice input.
    const block = createOptionBlock({
      id: 'temporary-option',
      parentId: null,
      nextId: 'choice-2',
    });

    expect(
      getNewChoiceOptionDropResolution(
        createMoveEvent(block.id),
        createWorkspace([block]),
        scene,
      ),
    ).toEqual({ kind: 'rollback' });
  });

  it('reorders a persisted option within its owning container', () => {
    const block = createOptionBlock({
      id: 'option-2',
      nextId: 'option-1',
    });

    expect(
      getReorderedChoiceOptionBlock(
        createMoveEvent(block.id),
        createWorkspace([block]),
        scene,
      ),
    ).toEqual({
      nodeId: 'choice-1',
      optionId: 'option-2',
      beforeOptionId: 'option-1',
    });
  });

  it('detects attempts to move an existing option to another choice', () => {
    const block = createOptionBlock({
      id: 'option-1',
      parentId: 'choice-2',
    });

    expect(
      isChoiceOptionOutsideOwningChoice(
        createMoveEvent(block.id),
        createWorkspace([block]),
        scene,
      ),
    ).toBe(true);
  });
});
