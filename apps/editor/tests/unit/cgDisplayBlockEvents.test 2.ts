/**
 * 文件主要作用：验证 CG display dialogue-only body drops 的行为。
 * 测试覆盖：`CG display dialogue-only body drops`。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  getNewCgDisplayDrop,
  isInvalidCgDisplayBodyDrop,
} from '../../src/renderer/features/block-editor/cgDisplayBlockEvents';
import { CG_DISPLAY_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/cgDisplayBlock';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import { BACKGROUND_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import { CHARACTER_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/characterBlock';
import { VIDEO_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/videoBlock';
import { CHOICE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import {
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  LOGIC_CONTROL_INPUTS,
  setLogicControlMarkers,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: 'Scene',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [
    {
      id: 'cg-1',
      type: 'cgDisplay',
      assetId: 'image-1',
      leadInMs: 0,
    },
    {
      id: 'cg-end-1',
      type: 'cgEndDisplay',
      cgDisplayNodeId: 'cg-1',
    },
  ],
};

function dropFor(
  blockType: string,
  parentId = 'cg-1',
  trailingBlockType?: string,
) {
  const trailingBlock = trailingBlockType
    ? {
        id: 'trailing',
        type: trailingBlockType,
        getNextBlock: () => null,
      }
    : null;
  const block = {
    id: 'dropped',
    type: blockType,
    getNextBlock: () => trailingBlock,
    getSurroundParent: () => parent,
  };
  const parent = {
    id: parentId,
    type: CG_DISPLAY_BLOCK_TYPE,
    getInputTargetBlock: () => block,
  };
  const workspace = {
    getBlockById: () => block,
  } as unknown as Blockly.WorkspaceSvg;
  const event = {
    type: Blockly.Events.BLOCK_MOVE,
    blockId: 'dropped',
    reason: ['drag'],
  } as unknown as Blockly.Events.Abstract;
  return isInvalidCgDisplayBodyDrop(event, workspace, scene);
}

describe('CG display dialogue-only body drops', () => {
  it.each([
    BACKGROUND_BLOCK_TYPE,
    CHARACTER_BLOCK_TYPE,
    VIDEO_BLOCK_TYPE,
    CHOICE_BLOCK_TYPE,
    LOGIC_IF_BLOCK_TYPE,
    LOGIC_REPEAT_BLOCK_TYPE,
    CG_DISPLAY_BLOCK_TYPE,
  ])('restores projection before a %s block can call a generic action', (type) => {
    expect(dropFor(type)).toBe(true);
  });

  it('allows dialogue and ignores temporary, unpersisted CG parents', () => {
    expect(dropFor(DIALOGUE_BLOCK_TYPE)).toBe(false);
    expect(dropFor(BACKGROUND_BLOCK_TYPE, 'toolbox-cg')).toBe(false);
  });

  it('rejects an invalid block carried below a dialogue stack root', () => {
    expect(
      dropFor(DIALOGUE_BLOCK_TYPE, 'cg-1', BACKGROUND_BLOCK_TYPE),
    ).toBe(true);
  });

  it.each([
    {
      label: 'If Then',
      root: {
        id: 'if-1',
        type: 'logicIf' as const,
        condition: {
          left: { kind: 'variable' as const, name: 'route' },
          operator: 'eq' as const,
          right: { kind: 'literal' as const, value: 'A' },
        },
      },
      marker: {
        id: 'else-1',
        type: 'logicElse' as const,
        ifNodeId: 'if-1',
      },
      end: {
        id: 'endif-1',
        type: 'logicEndIf' as const,
        ifNodeId: 'if-1',
      },
      input: LOGIC_CONTROL_INPUTS.then,
      markers: {
        kind: 'if' as const,
        elseNodeId: 'else-1',
        endNodeId: 'endif-1',
      },
      beforeNodeId: 'else-1',
    },
    {
      label: 'Repeat body',
      root: { id: 'repeat-1', type: 'logicRepeat' as const, count: 2 },
      marker: {
        id: 'endrepeat-1',
        type: 'logicEndRepeat' as const,
        repeatNodeId: 'repeat-1',
      },
      end: null,
      input: LOGIC_CONTROL_INPUTS.body,
      markers: {
        kind: 'repeat' as const,
        endNodeId: 'endrepeat-1',
      },
      beforeNodeId: 'endrepeat-1',
    },
  ])('adds a complete CG C block inside $label', ({
    root,
    marker,
    end,
    input,
    markers,
    beforeNodeId,
  }) => {
    const child = {
      id: 'toolbox-cg',
      type: CG_DISPLAY_BLOCK_TYPE,
      getNextBlock: () => null,
      getPreviousBlock: () => null,
      getSurroundParent: () => parent,
      getFieldValue: (name: string) =>
        name === 'ASSET_ID' ? 'image-1' : 0.75,
    } as unknown as Blockly.BlockSvg;
    const parent = {
      id: root.id,
      type:
        root.type === 'logicIf'
          ? LOGIC_IF_BLOCK_TYPE
          : LOGIC_REPEAT_BLOCK_TYPE,
      data: null,
      getInputTargetBlock: (name: string) => name === input ? child : null,
    } as unknown as Blockly.Block;
    setLogicControlMarkers(parent, markers);
    const nestedScene: SceneDocument = {
      ...scene,
      nodes: [root, marker, ...(end ? [end] : [])],
    };
    const workspace = {
      getBlockById: () => child,
    } as unknown as Blockly.WorkspaceSvg;
    const move = {
      type: Blockly.Events.BLOCK_MOVE,
      blockId: child.id,
      reason: ['drag'],
    } as unknown as Blockly.Events.Abstract;

    expect(getNewCgDisplayDrop(move, workspace, nestedScene)).toMatchObject({
      assetId: 'image-1',
      leadInMs: 750,
      afterNodeId: null,
      beforeNodeId,
    });
  });
});
