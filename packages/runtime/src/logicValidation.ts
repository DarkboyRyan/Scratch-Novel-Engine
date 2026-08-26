import type {
  LogicCondition,
  LogicOperand,
  LogicValue,
  ProjectDocument,
  SceneNode,
} from './projectTypes';

export const MAX_LOGIC_NESTING_DEPTH = 16;
export const MAX_REPEAT_COUNT = 1_000;
export const MAX_AUTOMATIC_STEPS_PER_ADVANCE = 10_000;
export const MAX_VARIABLE_NAME_BYTES = 64;
export const MAX_LOGIC_STRING_BYTES = 4_096;
// 32 maximum-sized values plus names stay comfortably below the Player's
// 256 KiB save-document cap, including cursor and presentation metadata.
export const MAX_RUNTIME_VARIABLES = 32;
export const MAX_RUNTIME_VARIABLE_BYTES = 192 * 1_024;

// Kept platform-independent so Main, the browser Player and the C++ boundary
// all enforce byte limits with the same UTF-8 semantics.
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index)!;
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
      index += 1;
    }
  }
  return bytes;
}

export function isLogicVariableName(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    utf8ByteLength(value) <= MAX_VARIABLE_NAME_BYTES &&
    !/^[\t\n\v\f\r ]|[\t\n\v\f\r ]$/.test(value) &&
    !value.includes('\0');
}

export function isLogicValue(value: unknown): value is LogicValue {
  return typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' &&
      utf8ByteLength(value) <= MAX_LOGIC_STRING_BYTES &&
      !value.includes('\0'));
}

export function isLogicOperand(value: unknown): value is LogicOperand {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const operand = value as Record<string, unknown>;
  if (operand.kind === 'variable') {
    return Object.keys(operand).length === 2 &&
      Object.hasOwn(operand, 'name') &&
      isLogicVariableName(operand.name);
  }
  return operand.kind === 'literal' &&
    Object.keys(operand).length === 2 &&
    Object.hasOwn(operand, 'value') &&
    isLogicValue(operand.value);
}

export function isLogicCondition(value: unknown): value is LogicCondition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const condition = value as Record<string, unknown>;
  return Object.keys(condition).length === 3 &&
    Object.hasOwn(condition, 'left') &&
    Object.hasOwn(condition, 'operator') &&
    Object.hasOwn(condition, 'right') &&
    isLogicOperand(condition.left) &&
    (condition.operator === 'eq' ||
      condition.operator === 'neq' ||
      condition.operator === 'gt' ||
      condition.operator === 'gte' ||
      condition.operator === 'lt' ||
      condition.operator === 'lte') &&
    isLogicOperand(condition.right);
}

function collectOperandVariable(
  operand: LogicOperand,
  names: Set<string>,
): void {
  if (operand.kind === 'variable') {
    names.add(operand.name);
  }
}

export function projectLogicVariableNames(
  project: Pick<ProjectDocument, 'scenes'>,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const scene of project.scenes) {
    for (const node of scene.nodes as readonly SceneNode[]) {
      if (node.type === 'variableSet' || node.type === 'variableChange') {
        names.add(node.variableName);
      } else if (node.type === 'logicIf') {
        collectOperandVariable(node.condition.left, names);
        collectOperandVariable(node.condition.right, names);
      }
    }
  }
  return names;
}

export function validateProjectLogicVariableBudget(
  project: Pick<ProjectDocument, 'scenes'>,
): string | null {
  const names = projectLogicVariableNames(project);
  return names.size <= MAX_RUNTIME_VARIABLES
    ? null
    : `剧情变量不能超过 ${MAX_RUNTIME_VARIABLES} 个`;
}
