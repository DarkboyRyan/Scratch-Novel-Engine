/**
 * 文件主要作用：解析人物特效积木的连接、字段更新和顺序变更。
 * 包含实现：`CharacterEffectFieldDraft`、`CharacterEffectMutation`、`getCharacterEffectMutation`、`collectCharacterEffectFieldDrafts`、`getCharacterEffectOwnerForDelete`。
 */

import * as Blockly from 'blockly';

import type {
  CharacterEffect,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  CHARACTER_BLOCK_INPUTS,
  CHARACTER_BLOCK_TYPE,
} from './blocks/characterBlock';
import {
  CHARACTER_EFFECT_FIELDS,
  getCharacterEffectOwner,
  isCharacterEffectBlockType,
  readCharacterEffectBlock,
} from './blocks/characterEffectBlock';

export type CharacterEffectFieldDraft = {
  nodeId: string;
  effect: CharacterEffect | null;
};

export type CharacterEffectMutation =
  | {
      kind: 'update';
      nodeId: string;
      effect: CharacterEffect | null;
    }
  | {
      kind: 'move';
      fromNodeId: string;
      toNodeId: string;
      effect: CharacterEffect;
    }
  | { kind: 'restore-projection' };

function sameEffect(
  left: CharacterEffect | null,
  right: CharacterEffect | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (
    left.type !== right.type ||
    left.durationMs !== right.durationMs
  ) {
    return false;
  }
  if (!('intensity' in left)) {
    return true;
  }
  if (
    !('intensity' in right) ||
    left.intensity !== right.intensity
  ) {
    return false;
  }
  return left.type !== 'slideIn' ||
    (right.type === 'slideIn' && left.direction === right.direction);
}

function characterNode(
  scene: SceneDocument,
  nodeId: string | undefined,
) {
  if (!nodeId) {
    return null;
  }
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  return node?.type === 'character' ? node : null;
}

function attachedCharacterNodeId(block: Blockly.Block): string | null {
  const parent = block.getParent();
  return parent?.type === CHARACTER_BLOCK_TYPE &&
    parent.getInputTargetBlock(CHARACTER_BLOCK_INPUTS.effect)?.id === block.id
    ? parent.id
    : null;
}

export function getCharacterEffectMutation(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): CharacterEffectMutation | null {
  const blockId = 'blockId' in event && typeof event.blockId === 'string'
    ? event.blockId
    : null;
  const block = blockId ? workspace.getBlockById(blockId) : null;

  if (
    event.type === Blockly.Events.BLOCK_CHANGE &&
    block &&
    isCharacterEffectBlockType(block.type)
  ) {
    const changeEvent = event as Blockly.Events.BlockChange;
    if (
      changeEvent.element !== 'field' ||
      (changeEvent.name !== CHARACTER_EFFECT_FIELDS.durationSeconds &&
        changeEvent.name !== CHARACTER_EFFECT_FIELDS.intensity &&
        changeEvent.name !== CHARACTER_EFFECT_FIELDS.direction)
    ) {
      return null;
    }
    const nodeId = attachedCharacterNodeId(block);
    const node = characterNode(scene, nodeId ?? undefined);
    const effect = readCharacterEffectBlock(block);
    if (!node || node.assetId === null || !effect) {
      return { kind: 'restore-projection' };
    }
    return sameEffect(node.effect, effect)
      ? null
      : { kind: 'update', nodeId: node.id, effect };
  }

  if (
    event.type !== Blockly.Events.BLOCK_MOVE ||
    !block ||
    !isCharacterEffectBlockType(block.type)
  ) {
    return null;
  }

  if (workspace.isDragging?.()) {
    return null;
  }

  // 投影期间 Blockly 事件已整体禁用。这里按特效连接本身判断，而不是
  // 依赖可选的 reason=['drag'] 元数据；触控、键盘移动和部分 Zelos
  // 合并事件会省略 reason。Blockly 还会把拖动开始时的 disconnect
  // 事件排在最终 connect 事件之前统一派发，因此 event.newParentId 可能
  // 已经过时；以派发时工作区里的最终连接作为权威结果。
  const ownerNodeId = getCharacterEffectOwner(block);
  const ownerNode = characterNode(scene, ownerNodeId ?? undefined);
  const newNode = characterNode(
    scene,
    attachedCharacterNodeId(block) ?? undefined,
  );
  const hasValidNewConnection =
    newNode !== null &&
    newNode.assetId !== null;
  const effect = readCharacterEffectBlock(block);

  if (hasValidNewConnection && effect) {
    if (ownerNodeId === newNode.id) {
      return sameEffect(newNode.effect, effect)
        ? null
        : { kind: 'update', nodeId: newNode.id, effect };
    }
    if (newNode.effect !== null) {
      return { kind: 'restore-projection' };
    }
    if (ownerNodeId === null) {
      return { kind: 'update', nodeId: newNode.id, effect };
    }
    if (
      ownerNode !== null &&
      ownerNode.effect !== null &&
      sameEffect(ownerNode.effect, effect)
    ) {
      return {
        kind: 'move',
        fromNodeId: ownerNode.id,
        toNodeId: newNode.id,
        effect,
      };
    }
    return { kind: 'restore-projection' };
  }

  if (
    ownerNodeId !== null &&
    ownerNode !== null &&
    ownerNode.effect !== null
  ) {
    return { kind: 'update', nodeId: ownerNode.id, effect: null };
  }
  return { kind: 'restore-projection' };
}

export function collectCharacterEffectFieldDrafts(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): {
  drafts: CharacterEffectFieldDraft[];
  invalidNodeId: string | null;
} {
  const drafts: CharacterEffectFieldDraft[] = [];
  for (const node of scene.nodes) {
    if (node.type !== 'character' || node.assetId === null) {
      continue;
    }
    const parent = workspace.getBlockById(node.id);
    if (!parent || parent.type !== CHARACTER_BLOCK_TYPE) {
      continue;
    }
    const effectBlock = parent.getInputTargetBlock(
      CHARACTER_BLOCK_INPUTS.effect,
    );
    if (!effectBlock) {
      if (node.effect !== null) {
        drafts.push({ nodeId: node.id, effect: null });
      }
      continue;
    }
    if (!isCharacterEffectBlockType(effectBlock.type)) {
      return { drafts, invalidNodeId: node.id };
    }
    const effect = readCharacterEffectBlock(effectBlock);
    if (!effect) {
      return { drafts, invalidNodeId: node.id };
    }
    if (!sameEffect(node.effect, effect)) {
      drafts.push({ nodeId: node.id, effect });
    }
  }
  return { drafts, invalidNodeId: null };
}

export function getCharacterEffectOwnerForDelete(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
  blockId: string | null,
): string | null {
  const block = blockId ? workspace.getBlockById(blockId) : null;
  if (!block || !isCharacterEffectBlockType(block.type)) {
    return null;
  }
  const ownerNodeId = getCharacterEffectOwner(block);
  const node = characterNode(scene, ownerNodeId ?? undefined);
  return node && node.effect !== null ? node.id : null;
}
