/**
 * 文件主要作用：验证 choice Blockly blocks 的行为。
 * 测试覆盖：`choice Blockly blocks`。
 */

import * as Blockly from 'blockly';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CHOICE_BLOCK_INPUTS,
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_FIELDS,
  CHOICE_OPTION_BLOCK_TYPE,
  CHOICE_OPTION_CONNECTION_TYPE,
  registerChoiceBlocks,
  setChoiceOptionSceneOptions,
} from '../../src/renderer/features/block-editor/blocks/choiceBlock';

describe('choice Blockly blocks', () => {
  const workspaces: Blockly.Workspace[] = [];

  afterEach(() => {
    for (const workspace of workspaces) {
      workspace.dispose();
    }
    workspaces.length = 0;
  });

  it('keeps an empty choice container as a normal timeline block', () => {
    setChoiceOptionSceneOptions([
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: '场景 1',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [],
      },
    ]);
    registerChoiceBlocks();
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock(CHOICE_BLOCK_TYPE);

    expect(block.previousConnection).not.toBeNull();
    expect(block.nextConnection).not.toBeNull();
    expect(
      block
        .getInput(CHOICE_BLOCK_INPUTS.options)
        ?.connection?.getCheck(),
    ).toEqual([CHOICE_OPTION_CONNECTION_TYPE]);
    expect(
      block.getInputTargetBlock(CHOICE_BLOCK_INPUTS.options),
    ).toBeNull();
  });

  it('only exposes choice-option statement connections and scene targets', () => {
    setChoiceOptionSceneOptions([
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: '序章',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [],
      },
      {
        schemaVersion: 1,
        id: 'scene-2',
        name: '场景 2',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [],
      },
    ]);
    registerChoiceBlocks();
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock(CHOICE_OPTION_BLOCK_TYPE);

    expect(block.previousConnection?.getCheck()).toEqual([
      CHOICE_OPTION_CONNECTION_TYPE,
    ]);
    expect(block.nextConnection?.getCheck()).toEqual([
      CHOICE_OPTION_CONNECTION_TYPE,
    ]);
    expect(
      block.getFieldValue(CHOICE_OPTION_BLOCK_FIELDS.text),
    ).toBe('选项');
    expect(
      block.getFieldValue(CHOICE_OPTION_BLOCK_FIELDS.targetScene),
    ).toBe('scene-1');
  });
});
