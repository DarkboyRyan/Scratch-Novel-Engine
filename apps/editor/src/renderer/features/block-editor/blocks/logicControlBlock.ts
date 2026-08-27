/**
 * 文件主要作用：注册条件和循环控制积木及嵌套语句插槽。
 * 包含实现：`LOGIC_IF_BLOCK_TYPE`、`LOGIC_REPEAT_BLOCK_TYPE`、`LOGIC_CONTROL_INPUTS`、`LOGIC_CONTROL_FIELDS`、`LogicControlMarkers`、`readLogicIfBlock` 等 12 项。
 */

import * as Blockly from 'blockly';
import { isLogicVariableName } from '@vnengine/runtime';

import type {
  LogicCondition,
  LogicIfNode,
  LogicOperand,
  LogicRepeatNode,
} from '../../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../../i18n/editorLocalization';
import {
  formatLogicValue,
  getLogicValueType,
  parseLogicValue,
  type LogicValueType,
} from './variableBlock';

export const LOGIC_IF_BLOCK_TYPE = 'vn_logic_if';
export const LOGIC_REPEAT_BLOCK_TYPE = 'vn_logic_repeat';

export const LOGIC_CONTROL_INPUTS = {
  then: 'THEN',
  else: 'ELSE',
  body: 'BODY',
} as const;

export const LOGIC_CONTROL_FIELDS = {
  leftType: 'LEFT_TYPE',
  leftValue: 'LEFT_VALUE',
  operator: 'OPERATOR',
  rightType: 'RIGHT_TYPE',
  rightValue: 'RIGHT_VALUE',
  count: 'COUNT',
} as const;

const LABEL_FIELDS = {
  if: 'VN_LABEL_IF',
  then: 'VN_LABEL_THEN',
  else: 'VN_LABEL_ELSE',
  repeat: 'VN_LABEL_REPEAT',
  times: 'VN_LABEL_TIMES',
} as const;

type OperandFieldType = 'variable' | LogicValueType;

export type LogicControlMarkers =
  | {
      kind: 'if';
      elseNodeId: string;
      endNodeId: string;
    }
  | {
      kind: 'repeat';
      endNodeId: string;
    };

const CONTROL_DATA_PREFIX = 'vn-logic-control:';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

function operandTypeOptions(
  labels: EditorLabels,
): Blockly.MenuOption[] {
  return [
    [labels.blockly.operandVariable, 'variable'],
    [labels.blockly.valueTypeText, 'string'],
    [labels.blockly.valueTypeNumber, 'number'],
    [labels.blockly.valueTypeBoolean, 'boolean'],
  ];
}

function defaultOperandValue(type: OperandFieldType): string {
  return type === 'variable'
    ? 'score'
    : type === 'boolean'
      ? 'false'
      : type === 'number'
        ? '0'
        : '';
}

function isValidOperandValue(
  type: OperandFieldType,
  rawValue: string,
): boolean {
  return type === 'variable'
    ? isLogicVariableName(rawValue)
    : parseLogicValue(type, rawValue) !== null;
}

function createOperandTypeField(
  valueFieldName: string,
): Blockly.FieldDropdown {
  const field = new Blockly.FieldDropdown(() =>
    operandTypeOptions(currentLabels),
  );
  field.setValidator((newValue) => {
    const type = String(newValue) as OperandFieldType;
    const block = field.getSourceBlock();
    const rawValue = String(block?.getFieldValue(valueFieldName) ?? '');
    if (
      block &&
      (String(field.getValue()) !== type ||
        !isValidOperandValue(type, rawValue))
    ) {
      block.setFieldValue(defaultOperandValue(type), valueFieldName);
    }
    return type;
  });
  return field;
}

function operatorOptions(
  labels: EditorLabels,
): Blockly.MenuOption[] {
  return [
    [labels.blockly.operatorEq, 'eq'],
    [labels.blockly.operatorNeq, 'neq'],
    [labels.blockly.operatorGt, 'gt'],
    [labels.blockly.operatorGte, 'gte'],
    [labels.blockly.operatorLt, 'lt'],
    [labels.blockly.operatorLte, 'lte'],
  ];
}

function operandFieldType(operand: LogicOperand): OperandFieldType {
  return operand.kind === 'variable'
    ? 'variable'
    : getLogicValueType(operand.value);
}

function operandFieldValue(operand: LogicOperand): string {
  return operand.kind === 'variable'
    ? operand.name
    : formatLogicValue(operand.value);
}

function readOperand(
  block: Blockly.Block,
  typeField: string,
  valueField: string,
): LogicOperand | null {
  const type = String(
    block.getFieldValue(typeField) ?? 'variable',
  ) as OperandFieldType;
  const rawValue = String(block.getFieldValue(valueField) ?? '');
  if (type === 'variable') {
    return isLogicVariableName(rawValue)
      ? { kind: 'variable', name: rawValue }
      : null;
  }
  const value = parseLogicValue(type, rawValue);
  return value === null ? null : { kind: 'literal', value };
}

export function readLogicIfBlock(
  block: Blockly.Block,
): Pick<LogicIfNode, 'condition'> | null {
  const left = readOperand(
    block,
    LOGIC_CONTROL_FIELDS.leftType,
    LOGIC_CONTROL_FIELDS.leftValue,
  );
  const right = readOperand(
    block,
    LOGIC_CONTROL_FIELDS.rightType,
    LOGIC_CONTROL_FIELDS.rightValue,
  );
  const operator = String(
    block.getFieldValue(LOGIC_CONTROL_FIELDS.operator) ?? 'eq',
  ) as LogicCondition['operator'];

  return left && right
    ? { condition: { left, operator, right } }
    : null;
}

export function readLogicRepeatBlock(
  block: Blockly.Block,
): Pick<LogicRepeatNode, 'count'> | null {
  const count = Number(
    block.getFieldValue(LOGIC_CONTROL_FIELDS.count),
  );
  return Number.isSafeInteger(count) && count >= 1 && count <= 1000
    ? { count }
    : null;
}

export function setLogicIfBlockCondition(
  block: Blockly.Block,
  condition: LogicCondition,
): void {
  block.setFieldValue(
    operandFieldType(condition.left),
    LOGIC_CONTROL_FIELDS.leftType,
  );
  block.setFieldValue(
    operandFieldValue(condition.left),
    LOGIC_CONTROL_FIELDS.leftValue,
  );
  block.setFieldValue(
    condition.operator,
    LOGIC_CONTROL_FIELDS.operator,
  );
  block.setFieldValue(
    operandFieldType(condition.right),
    LOGIC_CONTROL_FIELDS.rightType,
  );
  block.setFieldValue(
    operandFieldValue(condition.right),
    LOGIC_CONTROL_FIELDS.rightValue,
  );
}

export function setLogicControlMarkers(
  block: Blockly.Block,
  markers: LogicControlMarkers,
): void {
  block.data = `${CONTROL_DATA_PREFIX}${JSON.stringify(markers)}`;
}

export function getLogicControlMarkers(
  block: Blockly.Block,
): LogicControlMarkers | null {
  if (!block.data?.startsWith(CONTROL_DATA_PREFIX)) {
    return null;
  }
  try {
    const value = JSON.parse(
      block.data.slice(CONTROL_DATA_PREFIX.length),
    ) as LogicControlMarkers;
    if (
      value.kind === 'if' &&
      typeof value.elseNodeId === 'string' &&
      typeof value.endNodeId === 'string'
    ) {
      return value;
    }
    if (
      value.kind === 'repeat' &&
      typeof value.endNodeId === 'string'
    ) {
      return value;
    }
  } catch {
    // Invalid data always belongs to a temporary/malformed block. The caller
    // will restore the authoritative projection instead of guessing markers.
  }
  return null;
}

export function applyLogicControlBlockLocalization(
  block: Blockly.Block,
  labels: EditorLabels,
): void {
  if (block.type === LOGIC_IF_BLOCK_TYPE) {
    block.setFieldValue(labels.blockly.logicIf, LABEL_FIELDS.if);
    block.setFieldValue(labels.blockly.logicThen, LABEL_FIELDS.then);
    block.setFieldValue(labels.blockly.logicElse, LABEL_FIELDS.else);
    for (const fieldName of [
      LOGIC_CONTROL_FIELDS.leftType,
      LOGIC_CONTROL_FIELDS.rightType,
    ]) {
      const field = block.getField(fieldName);
      if (field instanceof Blockly.FieldDropdown) {
        const value = String(field.getValue());
        field.setOptions(() => operandTypeOptions(labels));
        field.setValue(value);
      }
    }
    const operatorField = block.getField(LOGIC_CONTROL_FIELDS.operator);
    if (operatorField instanceof Blockly.FieldDropdown) {
      const value = String(operatorField.getValue());
      operatorField.setOptions(() => operatorOptions(labels));
      operatorField.setValue(value);
    }
    block.setTooltip(labels.blockly.logicIfTooltip);
    return;
  }

  block.setFieldValue(labels.blockly.logicRepeat, LABEL_FIELDS.repeat);
  block.setFieldValue(labels.blockly.logicTimes, LABEL_FIELDS.times);
  block.setTooltip(labels.blockly.logicRepeatTooltip);
}

export function registerLogicControlBlocks(
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;

  if (!Blockly.Blocks[LOGIC_IF_BLOCK_TYPE]) {
    Blockly.Blocks[LOGIC_IF_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField(currentLabels.blockly.logicIf, LABEL_FIELDS.if)
          .appendField(
            createOperandTypeField(LOGIC_CONTROL_FIELDS.leftValue),
            LOGIC_CONTROL_FIELDS.leftType,
          )
          .appendField(
            new Blockly.FieldTextInput('score'),
            LOGIC_CONTROL_FIELDS.leftValue,
          )
          .appendField(
            new Blockly.FieldDropdown(() =>
              operatorOptions(currentLabels),
            ),
            LOGIC_CONTROL_FIELDS.operator,
          )
          .appendField(
            createOperandTypeField(LOGIC_CONTROL_FIELDS.rightValue),
            LOGIC_CONTROL_FIELDS.rightType,
          )
          .appendField(
            new Blockly.FieldTextInput('0'),
            LOGIC_CONTROL_FIELDS.rightValue,
          );
        this.setFieldValue('number', LOGIC_CONTROL_FIELDS.rightType);
        this.appendStatementInput(LOGIC_CONTROL_INPUTS.then)
          .appendField(currentLabels.blockly.logicThen, LABEL_FIELDS.then);
        this.appendStatementInput(LOGIC_CONTROL_INPUTS.else)
          .appendField(currentLabels.blockly.logicElse, LABEL_FIELDS.else);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(120);
        this.setTooltip(currentLabels.blockly.logicIfTooltip);
        this.setHelpUrl('');
      },
    };
  }

  if (!Blockly.Blocks[LOGIC_REPEAT_BLOCK_TYPE]) {
    Blockly.Blocks[LOGIC_REPEAT_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField(
            currentLabels.blockly.logicRepeat,
            LABEL_FIELDS.repeat,
          )
          .appendField(
            new Blockly.FieldNumber(2, 1, 1000, 1),
            LOGIC_CONTROL_FIELDS.count,
          )
          .appendField(currentLabels.blockly.logicTimes, LABEL_FIELDS.times);
        this.appendStatementInput(LOGIC_CONTROL_INPUTS.body);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(120);
        this.setTooltip(currentLabels.blockly.logicRepeatTooltip);
        this.setHelpUrl('');
      },
    };
  }
}
