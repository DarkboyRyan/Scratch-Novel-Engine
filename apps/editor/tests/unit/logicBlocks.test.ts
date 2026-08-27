/**
 * 文件主要作用：验证 logic and variable Blockly definitions 的行为。
 * 测试覆盖：`logic and variable Blockly definitions`。
 */

import * as Blockly from 'blockly';
import { afterEach, describe, expect, it } from 'vitest';

import { getEditorLabels } from '../../src/renderer/i18n/editorLocalization';
import {
  LOGIC_CONTROL_FIELDS,
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  readLogicIfBlock,
  registerLogicControlBlocks,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';
import {
  readVariableSetBlock,
  registerVariableBlocks,
  VARIABLE_BLOCK_FIELDS,
  VARIABLE_SET_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/variableBlock';

describe('logic and variable Blockly definitions', () => {
  const workspaces: Blockly.Workspace[] = [];

  afterEach(() => {
    workspaces.splice(0).forEach((workspace) => workspace.dispose());
  });

  function createWorkspace(): Blockly.Workspace {
    registerVariableBlocks(getEditorLabels('zh-CN'));
    registerLogicControlBlocks(getEditorLabels('zh-CN'));
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    return workspace;
  }

  it('defines real C-shaped If/Else and bounded Repeat statement inputs', () => {
    const workspace = createWorkspace();
    const ifBlock = workspace.newBlock(LOGIC_IF_BLOCK_TYPE);
    const repeatBlock = workspace.newBlock(LOGIC_REPEAT_BLOCK_TYPE);

    expect(ifBlock.getInput(LOGIC_CONTROL_INPUTS.then)?.connection).not.toBeNull();
    expect(ifBlock.getInput(LOGIC_CONTROL_INPUTS.else)?.connection).not.toBeNull();
    expect(repeatBlock.getInput(LOGIC_CONTROL_INPUTS.body)?.connection).not.toBeNull();
    expect(ifBlock.previousConnection).not.toBeNull();
    expect(ifBlock.nextConnection).not.toBeNull();

    repeatBlock.setFieldValue('1001', LOGIC_CONTROL_FIELDS.count);
    expect(repeatBlock.getFieldValue(LOGIC_CONTROL_FIELDS.count)).toBe(1000);
    repeatBlock.setFieldValue('0', LOGIC_CONTROL_FIELDS.count);
    expect(repeatBlock.getFieldValue(LOGIC_CONTROL_FIELDS.count)).toBe(1);
  });

  it('switches variable value types to valid defaults atomically', () => {
    const workspace = createWorkspace();
    const block = workspace.newBlock(VARIABLE_SET_BLOCK_TYPE);
    block.setFieldValue('old text', VARIABLE_BLOCK_FIELDS.value);

    block.setFieldValue('number', VARIABLE_BLOCK_FIELDS.valueType);
    expect(block.getFieldValue(VARIABLE_BLOCK_FIELDS.value)).toBe('0');
    expect(readVariableSetBlock(block)).toEqual({
      variableName: 'score',
      value: 0,
    });

    block.setFieldValue('boolean', VARIABLE_BLOCK_FIELDS.valueType);
    expect(block.getFieldValue(VARIABLE_BLOCK_FIELDS.value)).toBe('false');
    expect(readVariableSetBlock(block)?.value).toBe(false);

    block.setFieldValue('string', VARIABLE_BLOCK_FIELDS.valueType);
    expect(block.getFieldValue(VARIABLE_BLOCK_FIELDS.value)).toBe('');
    expect(readVariableSetBlock(block)?.value).toBe('');
  });

  it('switches both comparison operands without leaving invalid drafts', () => {
    const workspace = createWorkspace();
    const block = workspace.newBlock(LOGIC_IF_BLOCK_TYPE);

    block.setFieldValue('number', LOGIC_CONTROL_FIELDS.leftType);
    expect(block.getFieldValue(LOGIC_CONTROL_FIELDS.leftValue)).toBe('0');
    block.setFieldValue('boolean', LOGIC_CONTROL_FIELDS.rightType);
    expect(block.getFieldValue(LOGIC_CONTROL_FIELDS.rightValue)).toBe('false');

    expect(readLogicIfBlock(block)).toEqual({
      condition: {
        left: { kind: 'literal', value: 0 },
        operator: 'eq',
        right: { kind: 'literal', value: false },
      },
    });

    block.setFieldValue('variable', LOGIC_CONTROL_FIELDS.rightType);
    expect(block.getFieldValue(LOGIC_CONTROL_FIELDS.rightValue)).toBe('score');
    expect(readLogicIfBlock(block)?.condition.right).toEqual({
      kind: 'variable',
      name: 'score',
    });
  });

  it('preserves non-ASCII whitespace in names and rejects ASCII-trim changes', () => {
    const workspace = createWorkspace();
    const block = workspace.newBlock(VARIABLE_SET_BLOCK_TYPE);
    block.setFieldValue('\u00a0score\u00a0', VARIABLE_BLOCK_FIELDS.name);
    expect(readVariableSetBlock(block)?.variableName).toBe('\u00a0score\u00a0');

    block.setFieldValue(' score ', VARIABLE_BLOCK_FIELDS.name);
    expect(readVariableSetBlock(block)).toBeNull();
  });
});
