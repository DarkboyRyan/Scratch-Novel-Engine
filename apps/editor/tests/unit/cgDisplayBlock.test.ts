/**
 * 文件主要作用：验证 CG display block 的行为。
 * 测试覆盖：`CG display block`。
 */

import * as Blockly from 'blockly';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyCgDisplayBlockLocalization,
  CG_DISPLAY_BLOCK_TYPE,
  CG_DISPLAY_FIELDS,
  CG_DISPLAY_INPUTS,
  readCgDisplayBlock,
  registerCgDisplayBlock,
  setCgDisplayBlockNode,
  setCgDisplayImageOptions,
} from '../../src/renderer/features/block-editor/blocks/cgDisplayBlock';
import { getEditorLabels } from '../../src/renderer/i18n/editorLocalization';

describe('CG display block', () => {
  const workspaces: Blockly.Workspace[] = [];
  afterEach(() => {
    workspaces.splice(0).forEach((workspace) => workspace.dispose());
  });

  it('shows seconds while reading an exact integer millisecond payload', () => {
    const zh = getEditorLabels('zh-CN');
    setCgDisplayImageOptions([
      { id: 'cg-image', type: 'image', displayName: '晨光' },
      { id: 'audio-1', type: 'audio', displayName: 'Voice' },
    ], zh);
    registerCgDisplayBlock(zh);
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock(CG_DISPLAY_BLOCK_TYPE);
    setCgDisplayBlockNode(block, {
      assetId: 'cg-image',
      leadInMs: 1251,
    });

    expect(block.getInput(CG_DISPLAY_INPUTS.body)).not.toBeNull();
    expect(block.getFieldValue(CG_DISPLAY_FIELDS.assetId)).toBe('cg-image');
    expect(block.getFieldValue(CG_DISPLAY_FIELDS.leadInSeconds)).toBe(1.251);
    expect(readCgDisplayBlock(block)).toEqual({
      assetId: 'cg-image',
      leadInMs: 1251,
    });
  });

  it('localizes labels without changing image or timing fields', () => {
    const zh = getEditorLabels('zh-CN');
    const en = getEditorLabels('en-US');
    setCgDisplayImageOptions([
      { id: 'cg-image', type: 'image', displayName: 'Morning' },
    ], zh);
    registerCgDisplayBlock(zh);
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock(CG_DISPLAY_BLOCK_TYPE);
    setCgDisplayBlockNode(block, { assetId: 'cg-image', leadInMs: 2500 });

    setCgDisplayImageOptions([
      { id: 'cg-image', type: 'image', displayName: 'Morning' },
    ], en);
    applyCgDisplayBlockLocalization(block, en);

    expect(block.getFieldValue('VN_LABEL_CG_DISPLAY')).toBe('Display CG');
    expect(block.getFieldValue(CG_DISPLAY_FIELDS.assetId)).toBe('cg-image');
    expect(readCgDisplayBlock(block)?.leadInMs).toBe(2500);
  });
});
