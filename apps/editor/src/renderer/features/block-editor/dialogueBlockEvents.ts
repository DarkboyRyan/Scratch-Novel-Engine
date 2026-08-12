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

export function getDialogueFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
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

  const isDialogueField =
    changeEvent.name === DIALOGUE_BLOCK_FIELDS.speaker ||
    changeEvent.name === DIALOGUE_BLOCK_FIELDS.text;

  if (!isDialogueField) {
    return null;
  }

  const block = workspace.getBlockById(
    changeEvent.blockId,
  );

  if (!block || block.type !== DIALOGUE_BLOCK_TYPE) {
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

export function getDroppedNewDialogueBlock(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): Blockly.BlockSvg | null {
  // BLOCK_CREATE 发生得太早，此时用户可能还在拖动。
  // BLOCK_MOVE 表示积木已经被放到工作区。
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }

  const moveEvent = event as Blockly.Events.BlockMove;

  if (!moveEvent.blockId) {
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

  return alreadyExists ? null : block;
}

