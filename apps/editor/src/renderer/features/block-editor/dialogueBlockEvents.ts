/**
 * 文件主要作用：解析对白积木拖放、草稿字段更新与时间线重排。
 * 包含实现：`DialogueFieldUpdate`、`DialogueFieldDraft`、`NewDialogueDrop`、`NewStoryExtensionDrop`、`NewStoryExtensionDropResolution`、`DialogueReorderDrop` 等 14 项。
 */

import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';

import {
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
} from './blocks/dialogueBlock';
import { STORY_CONTINUATION_BLOCK_TYPE } from './blocks/storyContinuationBlock';
import { isStoryBlockType } from './storyBlockTypes';
import { isStoryPaginationProjectionConsistent } from './storyBlockPagination';
import {
  getCgDisplayNodeIds,
  getLogicControlNodeIds,
} from './logicStructure';
import {
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  getLogicControlMarkers,
} from './blocks/logicControlBlock';
import {
  CG_DISPLAY_BLOCK_TYPE,
  getCgDisplayMarkers,
} from './blocks/cgDisplayBlock';

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

export type NewStoryExtensionDrop = {
  block: Blockly.BlockSvg;
  beforeNodeId: string | null;
};

export type NewStoryExtensionDropResolution =
  | {
      kind: 'add';
      drop: NewStoryExtensionDrop;
    }
  | {
      kind: 'rollback';
    };

export type DialogueReorderDrop = {
  nodeId: string;
  beforeNodeId: string | null;
};

export type TimelineReorderDropResolution =
  | {
      kind: 'reorder';
      drop: DialogueReorderDrop;
    }
  | {
      kind: 'restore-projection';
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
    if (node.type !== 'dialogue') {
      continue;
    }

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

export function getTimelineBeforeNodeIdForBlock(
  block: Blockly.BlockSvg,
  scene: SceneDocument,
): string | null {
  let nextBlock = block.getNextBlock();
  while (nextBlock !== null) {
    if (scene.nodes.some((node) => node.id === nextBlock?.id)) {
      return nextBlock.id;
    }
    nextBlock = nextBlock.getNextBlock();
  }

  // C 形积木的分支尾部没有可见 next block，但在权威
  // flat timeline 中必须放在 Else/End marker 之前。marker ID 只从
  // 投影时写入的 block.data 取得，不会猜测或生成。
  const surroundParent = getSurroundParent(block);
  const markers = surroundParent
    ? getLogicControlMarkers(surroundParent)
    : null;
  if (
    surroundParent?.type === LOGIC_IF_BLOCK_TYPE &&
    markers?.kind === 'if'
  ) {
    const isInThenBranch = blockAppearsInStatementChain(
      surroundParent.getInputTargetBlock(LOGIC_CONTROL_INPUTS.then),
      block,
    );
    return isInThenBranch ? markers.elseNodeId : markers.endNodeId;
  }
  if (
    surroundParent?.type === LOGIC_REPEAT_BLOCK_TYPE &&
    markers?.kind === 'repeat'
  ) {
    return markers.endNodeId;
  }
  const cgMarkers = surroundParent
    ? getCgDisplayMarkers(surroundParent)
    : null;
  if (
    surroundParent?.type === CG_DISPLAY_BLOCK_TYPE &&
    cgMarkers !== null
  ) {
    return cgMarkers.endNodeId;
  }

  // 分页或显式跳转会让某些权威后继不再是物理 next 积木。
  // 当被拖动的积木没有 next 连接时，用上方正式节点在
  // Scene 中的后继作为锚点。
  const previousBlock = block.getPreviousBlock();
  const previousIndex = previousBlock
    ? scene.nodes.findIndex((node) => node.id === previousBlock.id)
    : -1;
  if (previousIndex >= 0) {
    const previousNode = scene.nodes[previousIndex];
    if (
      previousNode.type === 'logicIf' ||
      previousNode.type === 'logicRepeat' ||
      previousNode.type === 'cgDisplay'
    ) {
      const controlNodeIds = previousNode.type === 'cgDisplay'
        ? getCgDisplayNodeIds(scene, previousNode.id)
        : getLogicControlNodeIds(scene, previousNode.id);
      const endNodeId = controlNodeIds.at(-1);
      const endIndex = endNodeId
        ? scene.nodes.findIndex((node) => node.id === endNodeId)
        : -1;
      if (endIndex >= 0) {
        return scene.nodes[endIndex + 1]?.id ?? null;
      }
    }
    return (
      scene.nodes
        .slice(previousIndex + 1)
        .find((node) => node.id !== block.id)?.id ?? null
    );
  }

  return null;
}

function getSurroundParent(block: Blockly.Block): Blockly.Block | null {
  // Lightweight event-unit fakes created before nested controls do not expose
  // this Blockly API. Real Blockly blocks always do; treating a legacy fake as
  // top-level preserves the original non-logic behavior.
  return typeof block.getSurroundParent === 'function'
    ? block.getSurroundParent()
    : null;
}

function blockAppearsInStatementChain(
  firstBlock: Blockly.Block | null,
  target: Blockly.Block,
): boolean {
  let block = firstBlock;
  while (block) {
    if (block.id === target.id) {
      return true;
    }
    block = block.getNextBlock();
  }
  return false;
}

export function getNewStoryExtensionDropResolution(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): NewStoryExtensionDropResolution | null {
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }

  const moveEvent = event as Blockly.Events.BlockMove;
  if (
    !moveEvent.blockId ||
    !moveEvent.reason?.includes('drag') ||
    scene.nodes.some((node) => node.id === moveEvent.blockId)
  ) {
    return null;
  }

  const block = workspace.getBlockById(moveEvent.blockId);
  if (!block || block.type !== STORY_CONTINUATION_BLOCK_TYPE) {
    return null;
  }

  // 延伸是新页的页首，只有 next 连接口。吸附到某个已有
  // 剧情节点上方时，就在该节点前插入 marker；留在空白处
  // 则表示追加一个暂时没有内容的末尾分页。
  const nextBlock = block.getNextBlock();
  const nextNode = nextBlock
    ? scene.nodes.find((node) => node.id === nextBlock.id)
    : undefined;
  if (
    (nextBlock !== null &&
      (!nextNode || nextNode.type === 'storyExtension')) ||
    block.getPreviousBlock() !== null ||
    getSurroundParent(block) !== null
  ) {
    return { kind: 'rollback' };
  }

  return {
    kind: 'add',
    drop: {
      block,
      beforeNodeId: nextNode?.id ?? null,
    },
  };
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

  const beforeNodeId = getTimelineBeforeNodeIdForBlock(
    block,
    scene,
  );
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

export function getTimelineReorderDropResolution(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): TimelineReorderDropResolution | null {
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
  if (
    !block ||
    !isStoryBlockType(block.type)
  ) {
    return null;
  }

  const movedNode = scene.nodes.find(
    (node) => node.id === block.id,
  );
  if (movedNode?.type === 'storyExtension') {
    // 延伸代表一整页，不允许通过单块拖拽只移动 marker。
    // 页序只由它的数字字段触发 reorderMany 原子修改。
    return { kind: 'restore-projection' };
  }
  if (movedNode?.type === 'logicIf' || movedNode?.type === 'logicRepeat') {
    // C 形控制积木必须携带整个作用域移动，由专用
    // logicControl.reorder 命令处理，不能当作单个 timeline node。
    return null;
  }
  if (movedNode?.type === 'cgDisplay') {
    // CG C block has a paired end marker and moves atomically through its
    // dedicated command.
    return null;
  }

  const currentIndex = scene.nodes.findIndex(
    (node) => node.id === block.id,
  );
  const currentBeforeNodeId =
    scene.nodes[currentIndex + 1]?.id ?? null;
  const beforeNodeId = getTimelineBeforeNodeIdForBlock(
    block,
    scene,
  );

  // 权威顺序没有变化时不能发送 reorder IPC，但跨分页拖放仍可能已经
  // 改坏 Blockly 的物理连接。只有规范投影仍完整时才是真正的 no-op。
  if (
    beforeNodeId === block.id ||
    beforeNodeId === currentBeforeNodeId
  ) {
    return isStoryPaginationProjectionConsistent(scene, workspace)
      ? null
      : { kind: 'restore-projection' };
  }

  return {
    kind: 'reorder',
    drop: {
      nodeId: block.id,
      beforeNodeId,
    },
  };
}

export function getReorderedDialogueBlock(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): DialogueReorderDrop | null {
  const resolution = getTimelineReorderDropResolution(
    event,
    workspace,
    scene,
  );

  return resolution?.kind === 'reorder'
    ? resolution.drop
    : null;
}
