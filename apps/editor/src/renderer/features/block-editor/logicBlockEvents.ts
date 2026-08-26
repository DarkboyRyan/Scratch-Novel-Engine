import * as Blockly from 'blockly';

import type {
  LogicCondition,
  SceneDocument,
  VariableSetNode,
} from '../../../shared/projectTypes';
import {
  LOGIC_CONTROL_FIELDS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  readLogicIfBlock,
  readLogicRepeatBlock,
} from './blocks/logicControlBlock';
import {
  readVariableChangeBlock,
  readVariableSetBlock,
  VARIABLE_BLOCK_FIELDS,
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from './blocks/variableBlock';
import { getTimelineBeforeNodeIdForBlock } from './dialogueBlockEvents';
import { getLogicControlNodeIds } from './logicStructure';
import { isStoryPaginationProjectionConsistent } from './storyBlockPagination';

export type LogicFieldDraft =
  | {
      kind: 'variableSet';
      nodeId: string;
      variableName: string;
      value: VariableSetNode['value'];
    }
  | {
      kind: 'variableChange';
      nodeId: string;
      variableName: string;
      amount: number;
    }
  | {
      kind: 'logicIf';
      nodeId: string;
      condition: LogicCondition;
    }
  | {
      kind: 'logicRepeat';
      nodeId: string;
      count: number;
    };

export type LogicDraftCollection = {
  drafts: LogicFieldDraft[];
  invalidNodeId: string | null;
};

type LogicFieldDraftData = LogicFieldDraft extends infer Draft
  ? Draft extends { nodeId: string }
    ? Omit<Draft, 'nodeId'>
    : never
  : never;

export type NewLogicBlockDrop =
  | {
      kind: 'variableSet';
      block: Blockly.BlockSvg;
      beforeNodeId: string | null;
      variableName: string;
      value: VariableSetNode['value'];
    }
  | {
      kind: 'variableChange';
      block: Blockly.BlockSvg;
      beforeNodeId: string | null;
      variableName: string;
      amount: number;
    }
  | {
      kind: 'logicIf';
      block: Blockly.BlockSvg;
      beforeNodeId: string | null;
      condition: LogicCondition;
    }
  | {
      kind: 'logicRepeat';
      block: Blockly.BlockSvg;
      beforeNodeId: string | null;
      count: number;
    };

export type LogicControlReorderResolution =
  | {
      kind: 'reorder';
      nodeId: string;
      beforeNodeId: string | null;
    }
  | { kind: 'restore-projection' };

export type LogicControlDeleteResolution =
  | { kind: 'delete'; nodeId: string }
  | { kind: 'reject-mixed-selection' };

const VARIABLE_SET_FIELDS = new Set<string>([
  VARIABLE_BLOCK_FIELDS.name,
  VARIABLE_BLOCK_FIELDS.valueType,
  VARIABLE_BLOCK_FIELDS.value,
]);
const VARIABLE_CHANGE_FIELDS = new Set<string>([
  VARIABLE_BLOCK_FIELDS.name,
  VARIABLE_BLOCK_FIELDS.amount,
]);
const LOGIC_IF_FIELDS = new Set<string>([
  LOGIC_CONTROL_FIELDS.leftType,
  LOGIC_CONTROL_FIELDS.leftValue,
  LOGIC_CONTROL_FIELDS.operator,
  LOGIC_CONTROL_FIELDS.rightType,
  LOGIC_CONTROL_FIELDS.rightValue,
]);

function readBlockDraft(
  block: Blockly.Block,
): LogicFieldDraftData | null {
  if (block.type === VARIABLE_SET_BLOCK_TYPE) {
    const value = readVariableSetBlock(block);
    return value ? { kind: 'variableSet', ...value } : null;
  }
  if (block.type === VARIABLE_CHANGE_BLOCK_TYPE) {
    const value = readVariableChangeBlock(block);
    return value ? { kind: 'variableChange', ...value } : null;
  }
  if (block.type === LOGIC_IF_BLOCK_TYPE) {
    const value = readLogicIfBlock(block);
    return value ? { kind: 'logicIf', ...value } : null;
  }
  if (block.type === LOGIC_REPEAT_BLOCK_TYPE) {
    const value = readLogicRepeatBlock(block);
    return value ? { kind: 'logicRepeat', ...value } : null;
  }
  return null;
}

function draftMatchesNode(
  draft: LogicFieldDraftData,
  node: SceneDocument['nodes'][number],
): boolean {
  if (draft.kind !== node.type) {
    return false;
  }
  if (draft.kind === 'variableSet' && node.type === 'variableSet') {
    return draft.variableName === node.variableName &&
      draft.value === node.value;
  }
  if (draft.kind === 'variableChange' && node.type === 'variableChange') {
    return draft.variableName === node.variableName &&
      draft.amount === node.amount;
  }
  if (draft.kind === 'logicIf' && node.type === 'logicIf') {
    return JSON.stringify(draft.condition) === JSON.stringify(node.condition);
  }
  return draft.kind === 'logicRepeat' &&
    node.type === 'logicRepeat' &&
    draft.count === node.count;
}

export function collectLogicFieldDrafts(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): LogicDraftCollection {
  const drafts: LogicFieldDraft[] = [];
  for (const node of scene.nodes) {
    if (
      node.type !== 'variableSet' &&
      node.type !== 'variableChange' &&
      node.type !== 'logicIf' &&
      node.type !== 'logicRepeat'
    ) {
      continue;
    }
    const block = workspace.getBlockById(node.id);
    if (!block) {
      return { drafts, invalidNodeId: node.id };
    }
    const draft = readBlockDraft(block);
    if (!draft) {
      return { drafts, invalidNodeId: node.id };
    }
    if (!draftMatchesNode(draft, node)) {
      drafts.push({ nodeId: node.id, ...draft } as LogicFieldDraft);
    }
  }
  return { drafts, invalidNodeId: null };
}

export function getLogicFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): LogicFieldDraft | 'restore-projection' | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }
  const change = event as Blockly.Events.BlockChange;
  if (change.element !== 'field' || !change.blockId || !change.name) {
    return null;
  }
  const node = scene.nodes.find((candidate) => candidate.id === change.blockId);
  const block = workspace.getBlockById(change.blockId);
  if (!node || !block) {
    return null;
  }
  const matchingField =
    (block.type === VARIABLE_SET_BLOCK_TYPE &&
      VARIABLE_SET_FIELDS.has(change.name)) ||
    (block.type === VARIABLE_CHANGE_BLOCK_TYPE &&
      VARIABLE_CHANGE_FIELDS.has(change.name)) ||
    (block.type === LOGIC_IF_BLOCK_TYPE && LOGIC_IF_FIELDS.has(change.name)) ||
    (block.type === LOGIC_REPEAT_BLOCK_TYPE &&
      change.name === LOGIC_CONTROL_FIELDS.count);
  if (!matchingField) {
    return null;
  }
  const draft = readBlockDraft(block);
  return draft
    ? ({ nodeId: node.id, ...draft } as LogicFieldDraft)
    : 'restore-projection';
}

function isConnectedToPersistedTimeline(
  block: Blockly.BlockSvg,
  scene: SceneDocument,
  beforeNodeId: string | null,
): boolean {
  const surroundParent = block.getSurroundParent();
  if (surroundParent !== null) {
    // A child dropped into a temporary C block must wait until that parent has
    // a backend ID and paired-marker data. Otherwise it could be accidentally
    // appended as a top-level node while the temporary parent is rolled back.
    return beforeNodeId !== null &&
      scene.nodes.some(
        (node) =>
          node.id === surroundParent.id &&
          (node.type === 'logicIf' || node.type === 'logicRepeat'),
      );
  }
  if (scene.nodes.length === 0) {
    return true;
  }
  if (beforeNodeId !== null) {
    return true;
  }
  const previousBlock = block.getPreviousBlock();
  return previousBlock !== null &&
    scene.nodes.some((node) => node.id === previousBlock.id);
}

export function getNewLogicBlockDrop(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): NewLogicBlockDrop | 'restore-projection' | null {
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }
  const move = event as Blockly.Events.BlockMove;
  if (
    !move.blockId ||
    !move.reason?.includes('drag') ||
    scene.nodes.some((node) => node.id === move.blockId)
  ) {
    return null;
  }
  const block = workspace.getBlockById(move.blockId);
  if (
    !block ||
    ![
      VARIABLE_SET_BLOCK_TYPE,
      VARIABLE_CHANGE_BLOCK_TYPE,
      LOGIC_IF_BLOCK_TYPE,
      LOGIC_REPEAT_BLOCK_TYPE,
    ].includes(block.type)
  ) {
    return null;
  }
  const beforeNodeId = getTimelineBeforeNodeIdForBlock(block, scene);
  if (!isConnectedToPersistedTimeline(block, scene, beforeNodeId)) {
    return null;
  }
  const draft = readBlockDraft(block);
  if (!draft) {
    return 'restore-projection';
  }
  return {
    block,
    beforeNodeId,
    ...draft,
  } as NewLogicBlockDrop;
}

export function getLogicControlReorderResolution(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): LogicControlReorderResolution | null {
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }
  const move = event as Blockly.Events.BlockMove;
  if (!move.blockId || !move.reason?.includes('drag')) {
    return null;
  }
  const node = scene.nodes.find((candidate) => candidate.id === move.blockId);
  if (node?.type !== 'logicIf' && node?.type !== 'logicRepeat') {
    return null;
  }
  const block = workspace.getBlockById(node.id);
  if (!block) {
    return { kind: 'restore-projection' };
  }
  const structureNodeIds = getLogicControlNodeIds(scene, node.id);
  if (structureNodeIds.length === 0) {
    return { kind: 'restore-projection' };
  }
  const beforeNodeId = getTimelineBeforeNodeIdForBlock(block, scene);
  if (beforeNodeId && structureNodeIds.includes(beforeNodeId)) {
    return { kind: 'restore-projection' };
  }
  const lastNodeIndex = Math.max(
    ...structureNodeIds.map((id) =>
      scene.nodes.findIndex((candidate) => candidate.id === id),
    ),
  );
  const currentBeforeNodeId = scene.nodes[lastNodeIndex + 1]?.id ?? null;
  if (beforeNodeId === currentBeforeNodeId) {
    return isStoryPaginationProjectionConsistent(scene, workspace)
      ? null
      : { kind: 'restore-projection' };
  }
  return { kind: 'reorder', nodeId: node.id, beforeNodeId };
}

export function getLogicControlDeleteResolution(
  scene: SceneDocument,
  nodeIds: string[],
): LogicControlDeleteResolution | null {
  const controlRootIds = nodeIds.filter((nodeId) => {
    const node = scene.nodes.find((candidate) => candidate.id === nodeId);
    return node?.type === 'logicIf' || node?.type === 'logicRepeat';
  });
  if (controlRootIds.length === 0) {
    return null;
  }

  const owningRootIds = controlRootIds.filter((rootId) => {
    const structureIds = new Set(getLogicControlNodeIds(scene, rootId));
    return nodeIds.every((nodeId) => structureIds.has(nodeId));
  });
  return owningRootIds.length === 1
    ? { kind: 'delete', nodeId: owningRootIds[0] }
    : { kind: 'reject-mixed-selection' };
}
