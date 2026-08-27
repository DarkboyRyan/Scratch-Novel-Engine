/**
 * 文件主要作用：把 CG 显示积木的拖放和字段变化转换为引擎变更。
 * 包含实现：`CgDisplayFieldDraft`、`CgDisplayDraftCollection`、`NewCgDisplayDrop`、`CgDisplayReorderResolution`、`CgDisplayDeleteResolution`、`isInvalidCgDisplayBodyDrop` 等 11 项。
 */

import * as Blockly from 'blockly';

import type {
  CgDisplayNode,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  CG_DISPLAY_BLOCK_TYPE,
  CG_DISPLAY_FIELDS,
  CG_DISPLAY_INPUTS,
  readCgDisplayBlock,
} from './blocks/cgDisplayBlock';
import { getTimelineBeforeNodeIdForBlock } from './dialogueBlockEvents';
import { getCgDisplayNodeIds } from './logicStructure';
import { isStoryPaginationProjectionConsistent } from './storyBlockPagination';
import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';

export type CgDisplayFieldDraft = {
  nodeId: string;
  assetId: string;
  leadInMs: number;
};

export type CgDisplayDraftCollection = {
  drafts: CgDisplayFieldDraft[];
  invalidNodeId: string | null;
};

export type NewCgDisplayDrop = {
  block: Blockly.BlockSvg;
  assetId: string;
  leadInMs: number;
  afterNodeId: string | null;
  beforeNodeId: string | null;
};

export type CgDisplayReorderResolution =
  | {
      kind: 'reorder';
      nodeId: string;
      beforeNodeId: string | null;
    }
  | { kind: 'restore-projection' };

export type CgDisplayDeleteResolution =
  | { kind: 'delete'; nodeId: string }
  | { kind: 'reject-mixed-selection' };

export function isInvalidCgDisplayBodyDrop(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): boolean {
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return false;
  }
  const move = event as Blockly.Events.BlockMove;
  if (!move.blockId || !move.reason?.includes('drag')) {
    return false;
  }
  const block = workspace.getBlockById(move.blockId);
  const surroundParent = block?.getSurroundParent();
  if (
    !block ||
    surroundParent?.type !== CG_DISPLAY_BLOCK_TYPE ||
    !scene.nodes.some(
      (node) =>
        node.id === surroundParent.id && node.type === 'cgDisplay',
    )
  ) {
    return false;
  }

  // Blockly reports the move for the dragged stack root only. A Dialogue can
  // therefore carry an invalid Background/Logic/CG block underneath it. Scan
  // the complete direct BODY chain so that such a stack is restored before
  // any generic add/reorder IPC is attempted.
  let bodyBlock = surroundParent.getInputTargetBlock(
    CG_DISPLAY_INPUTS.body,
  );
  while (bodyBlock) {
    if (bodyBlock.type !== DIALOGUE_BLOCK_TYPE) {
      return true;
    }
    bodyBlock = bodyBlock.getNextBlock();
  }
  return false;
}

function draftMatchesNode(
  draft: Pick<CgDisplayNode, 'assetId' | 'leadInMs'>,
  node: SceneDocument['nodes'][number],
): boolean {
  return node.type === 'cgDisplay' &&
    node.assetId === draft.assetId &&
    node.leadInMs === draft.leadInMs;
}

export function collectCgDisplayFieldDrafts(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): CgDisplayDraftCollection {
  const drafts: CgDisplayFieldDraft[] = [];
  for (const node of scene.nodes) {
    if (node.type !== 'cgDisplay') {
      continue;
    }
    const block = workspace.getBlockById(node.id);
    if (!block || block.type !== CG_DISPLAY_BLOCK_TYPE) {
      return { drafts, invalidNodeId: node.id };
    }
    const draft = readCgDisplayBlock(block);
    if (!draft) {
      return { drafts, invalidNodeId: node.id };
    }
    if (!draftMatchesNode(draft, node)) {
      drafts.push({ nodeId: node.id, ...draft });
    }
  }
  return { drafts, invalidNodeId: null };
}

export function getCgDisplayFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): CgDisplayFieldDraft | 'restore-projection' | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }
  const change = event as Blockly.Events.BlockChange;
  if (
    change.element !== 'field' ||
    !change.blockId ||
    (change.name !== CG_DISPLAY_FIELDS.assetId &&
      change.name !== CG_DISPLAY_FIELDS.leadInSeconds)
  ) {
    return null;
  }
  const node = scene.nodes.find((candidate) => candidate.id === change.blockId);
  const block = workspace.getBlockById(change.blockId);
  if (node?.type !== 'cgDisplay' || block?.type !== CG_DISPLAY_BLOCK_TYPE) {
    return null;
  }
  const draft = readCgDisplayBlock(block);
  return draft
    ? { nodeId: node.id, ...draft }
    : 'restore-projection';
}

function flatPlacementAnchors(
  scene: SceneDocument,
  beforeNodeId: string | null,
): { afterNodeId: string | null; beforeNodeId: string | null } {
  if (beforeNodeId !== null) {
    return { afterNodeId: null, beforeNodeId };
  }
  return {
    afterNodeId: scene.nodes.at(-1)?.id ?? null,
    beforeNodeId: null,
  };
}

export function getNewCgDisplayDrop(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): NewCgDisplayDrop | 'restore-projection' | null {
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
  if (!block || block.type !== CG_DISPLAY_BLOCK_TYPE) {
    return null;
  }
  const beforeNodeId = getTimelineBeforeNodeIdForBlock(block, scene);
  const previousBlock = block.getPreviousBlock();
  const surroundParent = block.getSurroundParent();
  const isConnected =
    scene.nodes.length === 0 ||
    beforeNodeId !== null ||
    (previousBlock !== null &&
      scene.nodes.some((node) => node.id === previousBlock.id)) ||
    (surroundParent !== null &&
      scene.nodes.some((node) => node.id === surroundParent.id));
  if (!isConnected) {
    return null;
  }
  const draft = readCgDisplayBlock(block);
  if (!draft) {
    return 'restore-projection';
  }
  return {
    block,
    ...draft,
    ...flatPlacementAnchors(scene, beforeNodeId),
  };
}

export function getCgDisplayReorderResolution(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): CgDisplayReorderResolution | null {
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }
  const move = event as Blockly.Events.BlockMove;
  if (!move.blockId || !move.reason?.includes('drag')) {
    return null;
  }
  const node = scene.nodes.find((candidate) => candidate.id === move.blockId);
  if (node?.type !== 'cgDisplay') {
    return null;
  }
  const block = workspace.getBlockById(node.id);
  if (!block) {
    return { kind: 'restore-projection' };
  }
  const rangeNodeIds = getCgDisplayNodeIds(scene, node.id);
  if (rangeNodeIds.length === 0) {
    return { kind: 'restore-projection' };
  }
  const beforeNodeId = getTimelineBeforeNodeIdForBlock(block, scene);
  if (beforeNodeId && rangeNodeIds.includes(beforeNodeId)) {
    return { kind: 'restore-projection' };
  }
  const lastNodeIndex = Math.max(
    ...rangeNodeIds.map((id) =>
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

export function getCgDisplayDeleteResolution(
  scene: SceneDocument,
  nodeIds: string[],
): CgDisplayDeleteResolution | null {
  const rootIds = nodeIds.filter(
    (nodeId) =>
      scene.nodes.find((candidate) => candidate.id === nodeId)?.type ===
      'cgDisplay',
  );
  if (rootIds.length === 0) {
    return null;
  }
  const owningRootIds = rootIds.filter((rootId) => {
    const rangeIds = new Set(getCgDisplayNodeIds(scene, rootId));
    return nodeIds.every((nodeId) => rangeIds.has(nodeId));
  });
  return owningRootIds.length === 1
    ? { kind: 'delete', nodeId: owningRootIds[0] }
    : { kind: 'reject-mixed-selection' };
}
