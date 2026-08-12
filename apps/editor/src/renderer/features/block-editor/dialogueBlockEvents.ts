import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';

import {
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
} from './blocks/dialogueBlock';

export type DialogueFieldUpdate = {
  nodeId: string;
  speaker: string;
  text: string;
};

export type DialogueFieldDraft = DialogueFieldUpdate;

export type NewDialogueDrop = {
  block: Blockly.BlockSvg;
  beforeNodeId: string | null;
};

export type DialogueReorderDrop = {
  nodeId: string;
  beforeNodeId: string | null;
};

export function getDialogueFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): DialogueFieldUpdate | null {
  // Blockly 还会产生缩放、选择、移动等事件。
  // 本阶段只处理最终提交的字段变化。
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }

  const changeEvent = event as Blockly.Events.BlockChange;

  if (
    changeEvent.element !== 'field' ||
    !changeEvent.blockId
  ) {
    return null;
  }

  const field = changeEvent.name;
  const isDialogueField =
    field === DIALOGUE_BLOCK_FIELDS.speaker ||
    field === DIALOGUE_BLOCK_FIELDS.text;

  if (!isDialogueField) {
    return null;
  }

  const block = workspace.getBlockById(
    changeEvent.blockId,
  );

  if (
    !block ||
    block.type !== DIALOGUE_BLOCK_TYPE ||
    !scene.nodes.some((node) => node.id === block.id)
  ) {
    return null;
  }

  return {
    nodeId: block.id,
    speaker: String(
      block.getFieldValue(
        DIALOGUE_BLOCK_FIELDS.speaker,
      ) ?? '',
    ),
    text: String(
      block.getFieldValue(
        DIALOGUE_BLOCK_FIELDS.text,
      ) ?? '',
    ),
  };
}

// 保存项目时不等待 Blockly 的最终 BLOCK_CHANGE 事件。FieldInput
// 每次输入都会同步更新 block 的字段值，因此直接与 C++ 快照
// 比较，能收集到仍然聚焦在输入框中的最新文字。
export function collectDialogueFieldDrafts(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): DialogueFieldDraft[] {
  const drafts: DialogueFieldDraft[] = [];

  for (const node of scene.nodes) {
    const block = workspace.getBlockById(node.id);
    if (!block || block.type !== DIALOGUE_BLOCK_TYPE) {
      continue;
    }

    const speaker = String(
      block.getFieldValue(DIALOGUE_BLOCK_FIELDS.speaker) ?? '',
    );
    const text = String(
      block.getFieldValue(DIALOGUE_BLOCK_FIELDS.text) ?? '',
    );

    if (speaker !== node.speaker || text !== node.text) {
      drafts.push({ nodeId: node.id, speaker, text });
    }
  }

  return drafts;
}

function getSceneNodeBelow(
  block: Blockly.BlockSvg,
  scene: SceneDocument,
): string | null {
  const nextBlock = block.getNextBlock();
  const nextBlockBelongsToScene =
    nextBlock !== null &&
    scene.nodes.some((node) => node.id === nextBlock.id);

  return nextBlockBelongsToScene ? nextBlock.id : null;
}

function getSceneNodeAbove(
  block: Blockly.BlockSvg,
  scene: SceneDocument,
): string | null {
  const previousBlock = block.getPreviousBlock();
  const previousBlockBelongsToScene =
    previousBlock !== null &&
    scene.nodes.some((node) => node.id === previousBlock.id);

  return previousBlockBelongsToScene ? previousBlock.id : null;
}

export function getDroppedNewDialogueBlock(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): NewDialogueDrop | null {
  // BLOCK_CREATE 发生得太早，此时用户可能还在拖动。
  // BLOCK_MOVE 表示积木已经被放到工作区。
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }

  const moveEvent = event as Blockly.Events.BlockMove;

  if (
    !moveEvent.blockId ||
    !moveEvent.reason?.includes('drag')
  ) {
    return null;
  }

  const block = workspace.getBlockById(
    moveEvent.blockId,
  );

  if (!block || block.type !== DIALOGUE_BLOCK_TYPE) {
    return null;
  }

  // C++ 投影出来的 block.id 等于 node.id。
  // 不在 Scene 中的 ID 是 Blockly 临时生成的新积木 ID。
  const alreadyExists = scene.nodes.some(
    (node) => node.id === block.id,
  );

  if (alreadyExists) {
    return null;
  }

  const beforeNodeId = getSceneNodeBelow(block, scene);
  const afterNodeId = getSceneNodeAbove(block, scene);

  // 非空 Scene 中，积木必须真的接触到某个正式节点才进入 Project。
  // 未连接的新积木继续留在工作区，之后靠近连接口仍可再次拖入。
  if (
    scene.nodes.length > 0 &&
    beforeNodeId === null &&
    afterNodeId === null
  ) {
    return null;
  }

  // Blockly 会在插入一组 statement 积木时，把原本位于下方的积木
  // 重新连接到新积木后面。这个正式节点就是 C++ 的 beforeNodeId。
  return {
    block,
    beforeNodeId,
  };
}

export function getReorderedDialogueBlock(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): DialogueReorderDrop | null {
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }

  const moveEvent = event as Blockly.Events.BlockMove;
  if (
    !moveEvent.blockId ||
    !moveEvent.reason?.includes('drag') ||
    !scene.nodes.some((node) => node.id === moveEvent.blockId)
  ) {
    return null;
  }

  const block = workspace.getBlockById(moveEvent.blockId);
  if (!block || block.type !== DIALOGUE_BLOCK_TYPE) {
    return null;
  }

  const currentIndex = scene.nodes.findIndex(
    (node) => node.id === block.id,
  );
  const currentBeforeNodeId =
    scene.nodes[currentIndex + 1]?.id ?? null;
  const beforeNodeId = getSceneNodeBelow(block, scene);

  // 放回原位、垃圾桶取消拖动和理论上的自连接都不应发送 IPC。
  if (
    beforeNodeId === block.id ||
    beforeNodeId === currentBeforeNodeId
  ) {
    return null;
  }

  return {
    nodeId: block.id,
    beforeNodeId,
  };
}
