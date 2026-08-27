/**
 * 文件主要作用：解析选项及选项分支积木的创建、编辑和排序事件。
 * 包含实现：`ChoiceOptionLocation`、`ChoiceOptionFieldUpdate`、`NewChoiceOptionDrop`、`NewChoiceOptionDropResolution`、`ChoiceOptionReorderDrop`、`findChoiceOption` 等 11 项。
 */

import * as Blockly from 'blockly';

import type {
  ChoiceNode,
  ChoiceOption,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_FIELDS,
  CHOICE_OPTION_BLOCK_TYPE,
} from './blocks/choiceBlock';

export type ChoiceOptionLocation = {
  node: ChoiceNode;
  option: ChoiceOption;
  optionIndex: number;
};

export type ChoiceOptionFieldUpdate = {
  nodeId: string;
  optionId: string;
  text: string;
  targetSceneId: string;
};

export type NewChoiceOptionDrop = {
  block: Blockly.BlockSvg;
  nodeId: string;
  text: string;
  targetSceneId: string;
  beforeOptionId: string | null;
};

export type NewChoiceOptionDropResolution =
  | {
      kind: 'add';
      drop: NewChoiceOptionDrop;
    }
  | {
      kind: 'rollback';
    };

export type ChoiceOptionReorderDrop = {
  nodeId: string;
  optionId: string;
  beforeOptionId: string | null;
};

export function findChoiceOption(
  scene: SceneDocument,
  optionId: string,
): ChoiceOptionLocation | null {
  for (const node of scene.nodes) {
    if (node.type !== 'choice') {
      continue;
    }

    const optionIndex = node.options.findIndex(
      (option) => option.id === optionId,
    );
    if (optionIndex >= 0) {
      return {
        node,
        option: node.options[optionIndex],
        optionIndex,
      };
    }
  }

  return null;
}

function getChoiceOptionValues(block: Blockly.Block): {
  text: string;
  targetSceneId: string;
} {
  return {
    text: String(
      block.getFieldValue(CHOICE_OPTION_BLOCK_FIELDS.text) ?? '',
    ),
    targetSceneId: String(
      block.getFieldValue(
        CHOICE_OPTION_BLOCK_FIELDS.targetScene,
      ) ?? '',
    ),
  };
}

function getOwningChoiceBlock(
  block: Blockly.Block,
): Blockly.Block | null {
  const parent = block.getSurroundParent();
  return parent?.type === CHOICE_BLOCK_TYPE ? parent : null;
}

function isUserDrag(event: Blockly.Events.Abstract): event is Blockly.Events.BlockMove {
  return (
    event.type === Blockly.Events.BLOCK_MOVE &&
    Boolean(
      (event as Blockly.Events.BlockMove).reason?.includes('drag'),
    )
  );
}

export function getChoiceOptionFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): ChoiceOptionFieldUpdate | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }

  const change = event as Blockly.Events.BlockChange;
  if (
    change.element !== 'field' ||
    (change.name !== CHOICE_OPTION_BLOCK_FIELDS.text &&
      change.name !== CHOICE_OPTION_BLOCK_FIELDS.targetScene) ||
    !change.blockId
  ) {
    return null;
  }

  const block = workspace.getBlockById(change.blockId);
  const location = findChoiceOption(scene, change.blockId);
  if (
    block?.type !== CHOICE_OPTION_BLOCK_TYPE ||
    location === null
  ) {
    return null;
  }

  return {
    nodeId: location.node.id,
    optionId: location.option.id,
    ...getChoiceOptionValues(block),
  };
}

export function collectChoiceOptionFieldDrafts(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): ChoiceOptionFieldUpdate[] {
  const drafts: ChoiceOptionFieldUpdate[] = [];

  for (const node of scene.nodes) {
    if (node.type !== 'choice') {
      continue;
    }

    for (const option of node.options) {
      const block = workspace.getBlockById(option.id);
      if (block?.type !== CHOICE_OPTION_BLOCK_TYPE) {
        continue;
      }

      const values = getChoiceOptionValues(block);
      if (
        values.text !== option.text ||
        values.targetSceneId !== option.targetSceneId
      ) {
        drafts.push({
          nodeId: node.id,
          optionId: option.id,
          ...values,
        });
      }
    }
  }

  return drafts;
}

export function getNewChoiceOptionDropResolution(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): NewChoiceOptionDropResolution | null {
  if (!isUserDrag(event)) {
    return null;
  }

  const block = event.blockId
    ? workspace.getBlockById(event.blockId)
    : null;
  if (
    !block ||
    block.type !== CHOICE_OPTION_BLOCK_TYPE ||
    findChoiceOption(scene, block.id) !== null
  ) {
    return null;
  }

  const parent = getOwningChoiceBlock(block);
  const choice = parent
    ? scene.nodes.find(
        (node): node is ChoiceNode =>
          node.id === parent.id && node.type === 'choice',
      )
    : undefined;
  if (!choice) {
    // ChoiceOption 的连接类型无法单独阻止它接到未设类型约束的顶层
    // 剧情链。新积木若不在一个已持久化的 ChoiceNode 内，必须恢复
    // C++ 权威快照；只忽略事件会让未持久化积木残留并可能拆开剧情链。
    return { kind: 'rollback' };
  }

  const nextBlock = block.getNextBlock();
  const beforeOptionId =
    nextBlock &&
    choice.options.some((option) => option.id === nextBlock.id)
      ? nextBlock.id
      : null;

  return {
    kind: 'add',
    drop: {
      block: block as Blockly.BlockSvg,
      nodeId: choice.id,
      beforeOptionId,
      ...getChoiceOptionValues(block),
    },
  };
}

export function getReorderedChoiceOptionBlock(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): ChoiceOptionReorderDrop | null {
  if (!isUserDrag(event) || !event.blockId) {
    return null;
  }

  const location = findChoiceOption(scene, event.blockId);
  const block = workspace.getBlockById(event.blockId);
  if (
    location === null ||
    block?.type !== CHOICE_OPTION_BLOCK_TYPE ||
    getOwningChoiceBlock(block)?.id !== location.node.id
  ) {
    return null;
  }

  const nextBlock = block.getNextBlock();
  const beforeOptionId =
    nextBlock &&
    location.node.options.some(
      (option) => option.id === nextBlock.id,
    )
      ? nextBlock.id
      : null;
  const currentBeforeOptionId =
    location.node.options[location.optionIndex + 1]?.id ?? null;

  if (
    beforeOptionId === location.option.id ||
    beforeOptionId === currentBeforeOptionId
  ) {
    return null;
  }

  return {
    nodeId: location.node.id,
    optionId: location.option.id,
    beforeOptionId,
  };
}

export function isChoiceOptionOutsideOwningChoice(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): boolean {
  if (!isUserDrag(event) || !event.blockId) {
    return false;
  }

  const location = findChoiceOption(scene, event.blockId);
  const block = workspace.getBlockById(event.blockId);
  return (
    location !== null &&
    block?.type === CHOICE_OPTION_BLOCK_TYPE &&
    getOwningChoiceBlock(block)?.id !== location.node.id
  );
}
