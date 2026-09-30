/**
 * 文件主要作用：注册变量新建/赋值积木、项目级变量增减下拉框并解析多类型逻辑值。
 * 包含实现：`collectDeclaredVariableNames`、`setVariableChangeBlockOptions`、`readVariableSetBlock`、`readVariableChangeBlock` 等。
 */

import * as Blockly from 'blockly';
import {
  isLogicValue,
  isLogicVariableName,
} from '@vnengine/runtime';

import type {
  LogicValue,
  SceneDocument,
  VariableChangeNode,
  VariableSetNode,
} from '../../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../../i18n/editorLocalization';
import {
  SearchableVariableDropdown,
  type VariableSearchLabels,
} from './searchableVariableDropdown';

export {
  SearchableVariableDropdown,
  filterVariableNamesByPrefix,
} from './searchableVariableDropdown';

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
let currentDeclaredVariableNames: string[] = [];

function uniqueValidVariableNames(
  variableNames: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const variableName of variableNames) {
    if (!isLogicVariableName(variableName) || seen.has(variableName)) {
      continue;
    }
    seen.add(variableName);
    result.push(variableName);
  }
  return result;
}

export function collectDeclaredVariableNames(
  scenes: readonly SceneDocument[],
): string[] {
  return uniqueValidVariableNames(
    scenes.flatMap((scene) =>
      scene.nodes.flatMap((node) =>
        node.type === 'variableSet' ? [node.variableName] : [],
      ),
    ),
  );
}

export function setVariableBlockProjectScenes(
  scenes: readonly SceneDocument[],
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  currentDeclaredVariableNames = collectDeclaredVariableNames(scenes);
}

export function getDeclaredVariableNames(): readonly string[] {
  return currentDeclaredVariableNames;
}

function variableSearchLabels(labels: EditorLabels): VariableSearchLabels {
  return {
    placeholder: labels.blockly.searchVariables,
    ariaLabel: labels.blockly.searchVariablesAriaLabel,
    noMatches: labels.blockly.noMatchingVariables,
  };
}

function variableNameOptions(
  variableNames: readonly string[],
  labels: EditorLabels,
  preservedVariableName: string | null = null,
): Blockly.MenuOption[] {
  const names = uniqueValidVariableNames(variableNames);
  const options = names.map(
    (name) => [name, name] as Blockly.MenuOption,
  );
  if (
    preservedVariableName !== null &&
    isLogicVariableName(preservedVariableName) &&
    !names.includes(preservedVariableName)
  ) {
    options.push([
      `${labels.blockly.unlistedVariable} · ${preservedVariableName}`,
      preservedVariableName,
    ]);
  }
  return options.length > 0
    ? options
    : [[labels.blockly.noCreatedVariables, '']];
}

export function createVariableNameField(
  variableNames: readonly string[] = currentDeclaredVariableNames,
  labels: EditorLabels = currentLabels,
  preservedVariableName: string | null = null,
): SearchableVariableDropdown {
  return new SearchableVariableDropdown(
    () => variableNameOptions(
      variableNames,
      labels,
      preservedVariableName,
    ),
    variableSearchLabels(labels),
  );
}

export function setVariableNameFieldOptions(
  block: Blockly.Block,
  fieldName: string,
  variableNames: readonly string[] = currentDeclaredVariableNames,
  labels: EditorLabels = currentLabels,
  preferredVariableName: string | null = null,
): void {
  const existingField = block.getField(fieldName);
  const currentValue = preferredVariableName ??
    (existingField === null ? '' : String(existingField.getValue() ?? ''));
  const preservedVariableName = isLogicVariableName(currentValue)
    ? currentValue
    : null;
  const options = variableNameOptions(
    variableNames,
    labels,
    preservedVariableName,
  );

  let dropdown: SearchableVariableDropdown;
  if (existingField instanceof SearchableVariableDropdown) {
    dropdown = existingField;
    dropdown.setOptions(() => options);
    dropdown.setSearchLabels(variableSearchLabels(labels));
  } else if (existingField !== null) {
    const input = existingField.getParentInput();
    const fieldIndex = input.fieldRow.indexOf(existingField);
    input.removeField(fieldName);
    dropdown = new SearchableVariableDropdown(
      () => options,
      variableSearchLabels(labels),
    );
    input.insertFieldAt(
      Math.max(0, fieldIndex),
      dropdown,
      fieldName,
    );
  } else {
    return;
  }

  dropdown.setValue(
    preservedVariableName ?? uniqueValidVariableNames(variableNames)[0] ?? '',
  );
}

export function setVariableChangeBlockOptions(
  block: Blockly.Block,
  variableNames: readonly string[] = currentDeclaredVariableNames,
  labels: EditorLabels = currentLabels,
  preferredVariableName: string | null = null,
): void {
  setVariableNameFieldOptions(
    block,
    VARIABLE_BLOCK_FIELDS.name,
    variableNames,
    labels,
    preferredVariableName,
  );
}

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
  if (node.type === 'variableChange') {
    setVariableChangeBlockOptions(
      block,
      currentDeclaredVariableNames,
      currentLabels,
      node.variableName,
    );
  }
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
  setVariableChangeBlockOptions(
    block,
    currentDeclaredVariableNames,
    labels,
  );
  block.setFieldValue(labels.blockly.variableBy, LABEL_FIELDS.by);
  block.setTooltip(labels.blockly.variableChangeTooltip);
}

export function registerVariableBlocks(
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;

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

  // Blockly's global registry survives Renderer HMR. Replace the managed
  // definition so newly created blocks cannot keep the legacy text field.
  Blockly.Blocks[VARIABLE_CHANGE_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput()
        .appendField(
          currentLabels.blockly.changeVariable,
          LABEL_FIELDS.change,
        )
        .appendField(
          createVariableNameField(),
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
