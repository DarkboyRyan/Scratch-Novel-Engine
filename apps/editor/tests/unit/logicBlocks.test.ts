/**
 * 文件主要作用：验证 logic and variable Blockly definitions 的行为。
 * 测试覆盖：`logic and variable Blockly definitions`。
 */

import * as Blockly from 'blockly';
import { afterEach, describe, expect, it } from 'vitest';

import { getEditorLabels } from '../../src/renderer/i18n/editorLocalization';
import {
  applyLogicControlBlockLocalization,
  LOGIC_CONTROL_FIELDS,
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  readLogicIfBlock,
  registerLogicControlBlocks,
  setLogicIfBlockCondition,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';
import {
  applyVariableBlockLocalization,
  readVariableChangeBlock,
  readVariableSetBlock,
  registerVariableBlocks,
  setVariableBlockProjectScenes,
  VARIABLE_BLOCK_FIELDS,
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/variableBlock';

describe('logic and variable Blockly definitions', () => {
  const workspaces: Blockly.Workspace[] = [];

  afterEach(() => {
    workspaces.splice(0).forEach((workspace) => workspace.dispose());
  });

  function createWorkspace(): Blockly.Workspace {
    setVariableBlockProjectScenes([], getEditorLabels('zh-CN'));
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

    setVariableBlockProjectScenes([
      {
        schemaVersion: 1,
        id: 'declarations',
        name: 'Declarations',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [
          {
            id: 'set-score',
            type: 'variableSet',
            variableName: 'score',
            value: 0,
          },
        ],
      },
    ]);
    block.setFieldValue('variable', LOGIC_CONTROL_FIELDS.rightType);
    expect(block.getFieldValue(LOGIC_CONTROL_FIELDS.rightValue)).toBe('score');
    expect(readLogicIfBlock(block)?.condition.right).toEqual({
      kind: 'variable',
      name: 'score',
    });
  });

  it('uses project variable selectors only for variable operands', () => {
    setVariableBlockProjectScenes(
      [
        {
          schemaVersion: 1,
          id: 'declarations',
          name: 'Declarations',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
          nodes: [
            {
              id: 'set-score',
              type: 'variableSet',
              variableName: 'Score',
              value: 0,
            },
            {
              id: 'set-route',
              type: 'variableSet',
              variableName: 'sceneRoute',
              value: 'intro',
            },
            {
              id: 'set-flag',
              type: 'variableSet',
              variableName: 'isReady',
              value: true,
            },
          ],
        },
      ],
      getEditorLabels('zh-CN'),
    );
    registerVariableBlocks(getEditorLabels('zh-CN'));
    registerLogicControlBlocks(getEditorLabels('zh-CN'));
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock(LOGIC_IF_BLOCK_TYPE);

    const leftType = block.getField(
      LOGIC_CONTROL_FIELDS.leftType,
    ) as Blockly.FieldDropdown;
    expect(leftType.getOptions(false).map((option) => option[0])).toEqual([
      '现有变量',
      '文本常量',
      '数值常量',
      '布尔常量',
    ]);

    const left = block.getField(LOGIC_CONTROL_FIELDS.leftValue);
    expect(left).toBeInstanceOf(Blockly.FieldDropdown);
    expect(
      (left as Blockly.FieldDropdown)
        .getOptions(false)
        .map((option) => String(option[1])),
    ).toEqual(['Score', 'sceneRoute', 'isReady']);

    const rightLiteral = block.getField(LOGIC_CONTROL_FIELDS.rightValue);
    expect(rightLiteral).toBeInstanceOf(Blockly.FieldTextInput);
    expect(rightLiteral).not.toBeInstanceOf(Blockly.FieldDropdown);

    block.setFieldValue('variable', LOGIC_CONTROL_FIELDS.rightType);
    const rightVariable = block.getField(LOGIC_CONTROL_FIELDS.rightValue);
    expect(rightVariable).toBeInstanceOf(Blockly.FieldDropdown);
    expect(block.getFieldValue(LOGIC_CONTROL_FIELDS.rightValue)).toBe('Score');

    block.setFieldValue('string', LOGIC_CONTROL_FIELDS.leftType);
    const leftLiteral = block.getField(LOGIC_CONTROL_FIELDS.leftValue);
    expect(leftLiteral).toBeInstanceOf(Blockly.FieldTextInput);
    expect(leftLiteral).not.toBeInstanceOf(Blockly.FieldDropdown);
    block.setFieldValue('literal value', LOGIC_CONTROL_FIELDS.leftValue);
    expect(readLogicIfBlock(block)?.condition.left).toEqual({
      kind: 'literal',
      value: 'literal value',
    });

    block.setFieldValue('variable', LOGIC_CONTROL_FIELDS.leftType);
    expect(
      block.getField(LOGIC_CONTROL_FIELDS.leftValue),
    ).toBeInstanceOf(Blockly.FieldDropdown);
    expect(block.getFieldValue(LOGIC_CONTROL_FIELDS.leftValue)).toBe('Score');
  });

  it('keeps orphan If variable references and uses a non-persistable empty placeholder', () => {
    setVariableBlockProjectScenes(
      [
        {
          schemaVersion: 1,
          id: 'declarations',
          name: 'Declarations',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
          nodes: [
            {
              id: 'set-score',
              type: 'variableSet',
              variableName: 'score',
              value: 0,
            },
          ],
        },
      ],
      getEditorLabels('zh-CN'),
    );
    registerVariableBlocks(getEditorLabels('zh-CN'));
    registerLogicControlBlocks(getEditorLabels('zh-CN'));
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const authored = workspace.newBlock(LOGIC_IF_BLOCK_TYPE);
    setLogicIfBlockCondition(authored, {
      left: { kind: 'variable', name: 'legacyRoute' },
      operator: 'eq',
      right: { kind: 'literal', value: 0 },
    });

    const authoredField = authored.getField(
      LOGIC_CONTROL_FIELDS.leftValue,
    ) as Blockly.FieldDropdown;
    expect(authoredField).toBeInstanceOf(Blockly.FieldDropdown);
    expect(authored.getFieldValue(LOGIC_CONTROL_FIELDS.leftValue)).toBe(
      'legacyRoute',
    );
    expect(authoredField.getOptions(false).at(-1)).toEqual([
      '旧引用 · legacyRoute',
      'legacyRoute',
    ]);

    setVariableBlockProjectScenes([], getEditorLabels('zh-CN'));
    const empty = workspace.newBlock(LOGIC_IF_BLOCK_TYPE);
    const emptyField = empty.getField(
      LOGIC_CONTROL_FIELDS.leftValue,
    ) as Blockly.FieldDropdown;
    expect(emptyField).toBeInstanceOf(Blockly.FieldDropdown);
    expect(emptyField.getOptions(false)).toEqual([
      ['请先新建变量', ''],
    ]);
    expect(empty.getFieldValue(LOGIC_CONTROL_FIELDS.leftValue)).toBe('');
    expect(readLogicIfBlock(empty)).toBeNull();
  });

  it('keeps complete common-prefix names without leaking fields across type switches', () => {
    setVariableBlockProjectScenes(
      [
        {
          schemaVersion: 1,
          id: 'declarations',
          name: 'Declarations',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
          nodes: [
            {
              id: 'set-player-score',
              type: 'variableSet',
              variableName: 'player score',
              value: 0,
            },
            {
              id: 'set-player-route',
              type: 'variableSet',
              variableName: 'player route',
              value: 'intro',
            },
          ],
        },
      ],
      getEditorLabels('zh-CN'),
    );
    registerVariableBlocks(getEditorLabels('zh-CN'));
    registerLogicControlBlocks(getEditorLabels('zh-CN'));
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock(LOGIC_IF_BLOCK_TYPE);
    block.setFieldValue('string', LOGIC_CONTROL_FIELDS.leftType);
    const fieldCount = block.inputList[0]!.fieldRow.length;

    for (let index = 0; index < 3; index += 1) {
      block.setFieldValue('variable', LOGIC_CONTROL_FIELDS.leftType);
      const variableField = block.getField(
        LOGIC_CONTROL_FIELDS.leftValue,
      ) as Blockly.FieldDropdown;
      expect(
        variableField.getOptions(false).map((option) => option[0]),
      ).toEqual(['player score', 'player route']);
      expect(block.inputList[0]!.fieldRow).toHaveLength(fieldCount);

      block.setFieldValue('string', LOGIC_CONTROL_FIELDS.leftType);
      expect(block.inputList[0]!.fieldRow).toHaveLength(fieldCount);
    }
  });

  it('upgrades legacy If variable text fields and localizes orphan chrome without changing values', () => {
    setVariableBlockProjectScenes(
      [
        {
          schemaVersion: 1,
          id: 'declarations',
          name: 'Declarations',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
          nodes: [
            {
              id: 'set-score',
              type: 'variableSet',
              variableName: 'score',
              value: 0,
            },
          ],
        },
      ],
      getEditorLabels('zh-CN'),
    );
    registerVariableBlocks(getEditorLabels('zh-CN'));
    registerLogicControlBlocks(getEditorLabels('zh-CN'));
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock(LOGIC_IF_BLOCK_TYPE);
    const oldField = block.getField(LOGIC_CONTROL_FIELDS.leftValue)!;
    const input = oldField.getParentInput();
    const fieldIndex = input.fieldRow.indexOf(oldField);
    input.removeField(LOGIC_CONTROL_FIELDS.leftValue);
    input.insertFieldAt(
      fieldIndex,
      new Blockly.FieldTextInput('legacyRoute'),
      LOGIC_CONTROL_FIELDS.leftValue,
    );

    setVariableBlockProjectScenes([], getEditorLabels('en-US'));
    applyLogicControlBlockLocalization(block, getEditorLabels('en-US'));

    const upgraded = block.getField(LOGIC_CONTROL_FIELDS.leftValue);
    expect(upgraded).toBeInstanceOf(Blockly.FieldDropdown);
    expect(block.getFieldValue(LOGIC_CONTROL_FIELDS.leftValue)).toBe(
      'legacyRoute',
    );
    expect((upgraded as Blockly.FieldDropdown).getOptions(false)).toEqual([
      ['Legacy reference · legacyRoute', 'legacyRoute'],
    ]);
    expect(
      (
        block.getField(
          LOGIC_CONTROL_FIELDS.leftType,
        ) as Blockly.FieldDropdown
      ).getOptions(false).map((option) => option[0]),
    ).toEqual([
      'Existing variable',
      'Text literal',
      'Number literal',
      'Boolean literal',
    ]);
    expect(readLogicIfBlock(block)?.condition.left).toEqual({
      kind: 'variable',
      name: 'legacyRoute',
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

  it('keeps variable creation editable but makes numeric changes select an existing variable', () => {
    const workspace = createWorkspace();
    const createBlock = workspace.newBlock(VARIABLE_SET_BLOCK_TYPE);
    const changeBlock = workspace.newBlock(VARIABLE_CHANGE_BLOCK_TYPE);

    expect(
      createBlock.getField(VARIABLE_BLOCK_FIELDS.name),
    ).toBeInstanceOf(Blockly.FieldTextInput);
    const changeName = changeBlock.getField(VARIABLE_BLOCK_FIELDS.name);
    expect(changeName).toBeInstanceOf(Blockly.FieldDropdown);
  });

  it('uses a non-persistable placeholder when no variable has been created', () => {
    const workspace = createWorkspace();
    const block = workspace.newBlock(VARIABLE_CHANGE_BLOCK_TYPE);
    const field = block.getField(VARIABLE_BLOCK_FIELDS.name);
    expect(field).toBeInstanceOf(Blockly.FieldDropdown);

    const options = (field as Blockly.FieldDropdown).getOptions(false);
    expect(options).toHaveLength(1);
    expect(options[0]?.[0]).not.toBe('');
    expect(options[0]?.[1]).toBe('');
    expect(block.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe('');
    expect(readVariableChangeBlock(block)).toBeNull();
  });

  it('localizes dropdown chrome without changing an authored variable value', () => {
    const workspace = createWorkspace();
    const block = workspace.newBlock(VARIABLE_CHANGE_BLOCK_TYPE);
    const field = block.getField(VARIABLE_BLOCK_FIELDS.name)!;
    const input = field.getParentInput();
    const fieldIndex = input.fieldRow.indexOf(field);
    input.removeField(VARIABLE_BLOCK_FIELDS.name);
    input.insertFieldAt(
      fieldIndex,
      new Blockly.FieldTextInput('route'),
      VARIABLE_BLOCK_FIELDS.name,
    );

    applyVariableBlockLocalization(block, getEditorLabels('en-US'));

    expect(
      block.getField(VARIABLE_BLOCK_FIELDS.name),
    ).toBeInstanceOf(Blockly.FieldDropdown);
    expect(block.getFieldValue(VARIABLE_BLOCK_FIELDS.name)).toBe('route');
    expect(readVariableChangeBlock(block)).toEqual({
      variableName: 'route',
      amount: 1,
    });
  });
});
