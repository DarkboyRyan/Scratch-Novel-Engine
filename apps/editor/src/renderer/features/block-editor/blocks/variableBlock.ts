import * as Blockly from 'blockly';
import {
  isLogicValue,
  isLogicVariableName,
} from '@vnengine/runtime';

import type {
  LogicValue,
  VariableChangeNode,
  VariableSetNode,
} from '../../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../../i18n/editorLocalization';

export const VARIABLE_SET_BLOCK_TYPE = 'vn_variable_set';
export const VARIABLE_CHANGE_BLOCK_TYPE = 'vn_variable_change';

export const VARIABLE_BLOCK_FIELDS = {
  name: 'VARIABLE_NAME',
  valueType: 'VALUE_TYPE',
  value: 'VALUE',
  amount: 'AMOUNT',
} as const;

const LABEL_FIELDS = {
  set: 'VN_LABEL_VARIABLE_SET',
  to: 'VN_LABEL_VARIABLE_TO',
  change: 'VN_LABEL_VARIABLE_CHANGE',
  by: 'VN_LABEL_VARIABLE_BY',
} as const;

export type LogicValueType = 'string' | 'number' | 'boolean';

let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

function valueTypeOptions(
  labels: EditorLabels,
): Blockly.MenuOption[] {
  return [
    [labels.blockly.valueTypeText, 'string'],
    [labels.blockly.valueTypeNumber, 'number'],
    [labels.blockly.valueTypeBoolean, 'boolean'],
  ];
}

function defaultValueForType(type: LogicValueType): string {
  return type === 'boolean' ? 'false' : type === 'number' ? '0' : '';
}

function createValueTypeField(valueFieldName: string): Blockly.FieldDropdown {
  const field = new Blockly.FieldDropdown(() =>
    valueTypeOptions(currentLabels),
  );
  field.setValidator((newValue) => {
    const type = String(newValue) as LogicValueType;
    const block = field.getSourceBlock();
    const rawValue = String(block?.getFieldValue(valueFieldName) ?? '');
    if (
      block &&
      (String(field.getValue()) !== type ||
        parseLogicValue(type, rawValue) === null)
    ) {
      block.setFieldValue(defaultValueForType(type), valueFieldName);
    }
    return type;
  });
  return field;
}

export function getLogicValueType(value: LogicValue): LogicValueType {
  return typeof value === 'boolean'
    ? 'boolean'
    : typeof value === 'number'
      ? 'number'
      : 'string';
}

export function parseLogicValue(
  type: LogicValueType,
  rawValue: string,
): LogicValue | null {
  if (type === 'string') {
    return isLogicValue(rawValue) ? rawValue : null;
  }
  if (type === 'boolean') {
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    return null;
  }

  const value = Number(rawValue);
  return rawValue.trim() !== '' && isLogicValue(value)
    ? value
    : null;
}

export function formatLogicValue(value: LogicValue): string {
  return typeof value === 'string' ? value : String(value);
}

export function readVariableSetBlock(
  block: Blockly.Block,
): Omit<VariableSetNode, 'id' | 'type'> | null {
  const variableName = String(
    block.getFieldValue(VARIABLE_BLOCK_FIELDS.name) ?? '',
  );
  const valueType = String(
    block.getFieldValue(VARIABLE_BLOCK_FIELDS.valueType) ?? 'string',
  ) as LogicValueType;
  const value = parseLogicValue(
    valueType,
    String(block.getFieldValue(VARIABLE_BLOCK_FIELDS.value) ?? ''),
  );

  return isLogicVariableName(variableName) && value !== null
    ? { variableName, value }
    : null;
}

export function readVariableChangeBlock(
  block: Blockly.Block,
): Omit<VariableChangeNode, 'id' | 'type'> | null {
  const variableName = String(
    block.getFieldValue(VARIABLE_BLOCK_FIELDS.name) ?? '',
  );
  const amount = Number(
    block.getFieldValue(VARIABLE_BLOCK_FIELDS.amount),
  );

  return isLogicVariableName(variableName) && Number.isFinite(amount)
    ? { variableName, amount }
    : null;
}

export function setVariableBlockNode(
  block: Blockly.Block,
  node: VariableSetNode | VariableChangeNode,
): void {
  block.setFieldValue(node.variableName, VARIABLE_BLOCK_FIELDS.name);
  if (node.type === 'variableSet') {
    block.setFieldValue(
      getLogicValueType(node.value),
      VARIABLE_BLOCK_FIELDS.valueType,
    );
    block.setFieldValue(
      formatLogicValue(node.value),
      VARIABLE_BLOCK_FIELDS.value,
    );
  } else {
    block.setFieldValue(
      String(node.amount),
      VARIABLE_BLOCK_FIELDS.amount,
    );
  }
}

export function applyVariableBlockLocalization(
  block: Blockly.Block,
  labels: EditorLabels,
): void {
  if (block.type === VARIABLE_SET_BLOCK_TYPE) {
    block.setFieldValue(labels.blockly.setVariable, LABEL_FIELDS.set);
    block.setFieldValue(labels.blockly.variableTo, LABEL_FIELDS.to);
    const typeField = block.getField(VARIABLE_BLOCK_FIELDS.valueType);
    if (typeField instanceof Blockly.FieldDropdown) {
      const value = String(typeField.getValue());
      typeField.setOptions(() => valueTypeOptions(labels));
      typeField.setValue(value);
    }
    block.setTooltip(labels.blockly.variableSetTooltip);
    return;
  }

  block.setFieldValue(labels.blockly.changeVariable, LABEL_FIELDS.change);
  block.setFieldValue(labels.blockly.variableBy, LABEL_FIELDS.by);
  block.setTooltip(labels.blockly.variableChangeTooltip);
}

export function registerVariableBlocks(
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;

  if (!Blockly.Blocks[VARIABLE_SET_BLOCK_TYPE]) {
    Blockly.Blocks[VARIABLE_SET_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField(currentLabels.blockly.setVariable, LABEL_FIELDS.set)
          .appendField(
            new Blockly.FieldTextInput('score'),
            VARIABLE_BLOCK_FIELDS.name,
          )
          .appendField(currentLabels.blockly.variableTo, LABEL_FIELDS.to)
          .appendField(
            createValueTypeField(VARIABLE_BLOCK_FIELDS.value),
            VARIABLE_BLOCK_FIELDS.valueType,
          )
          .appendField(
            new Blockly.FieldTextInput('0'),
            VARIABLE_BLOCK_FIELDS.value,
          );
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(330);
        this.setTooltip(currentLabels.blockly.variableSetTooltip);
        this.setHelpUrl('');
      },
    };
  }

  if (!Blockly.Blocks[VARIABLE_CHANGE_BLOCK_TYPE]) {
    Blockly.Blocks[VARIABLE_CHANGE_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField(
            currentLabels.blockly.changeVariable,
            LABEL_FIELDS.change,
          )
          .appendField(
            new Blockly.FieldTextInput('score'),
            VARIABLE_BLOCK_FIELDS.name,
          )
          .appendField(currentLabels.blockly.variableBy, LABEL_FIELDS.by)
          .appendField(
            new Blockly.FieldNumber(1),
            VARIABLE_BLOCK_FIELDS.amount,
          );
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(330);
        this.setTooltip(currentLabels.blockly.variableChangeTooltip);
        this.setHelpUrl('');
      },
    };
  }
}
