/**
 * 文件主要作用：把场景文档投影为带嵌套结构和资源状态的 Blockly 积木。
 * 包含实现：`projectSceneToWorkspace`。
 */

import * as Blockly from 'blockly';

import type {
  AssetDocument,
  SceneDocument,
  SceneNode,
} from '../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../i18n/editorLocalization';
import {
  BACKGROUND_BLOCK_TYPE,
  setBackgroundBlockAsset,
  setBackgroundBlockScalePercent,
} from './blocks/backgroundBlock';
import {
  CHARACTER_BLOCK_FIELDS,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  setCharacterBlockAsset,
  setCharacterBlockPosition,
  setCharacterBlockScalePercent,
  CHARACTER_BLOCK_INPUTS,
} from './blocks/characterBlock';
import {
  characterEffectBlockType,
  setCharacterEffectBlock,
  setCharacterEffectOwner,
} from './blocks/characterEffectBlock';
import {
  SCENE_JUMP_BLOCK_FIELDS,
  SCENE_JUMP_BLOCK_TYPE,
} from './blocks/sceneJumpBlock';
import {
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
  setDialogueBlockVoice,
} from './blocks/dialogueBlock';
import { BGM_BLOCK_TYPE, setBgmBlockAsset } from './blocks/bgmBlock';
import { VIDEO_BLOCK_TYPE, setVideoBlockAsset } from './blocks/videoBlock';
import {
  CHOICE_BLOCK_INPUTS,
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_FIELDS,
  CHOICE_OPTION_BLOCK_TYPE,
} from './blocks/choiceBlock';
import {
  setStoryContinuationBlockSequence,
  STORY_CONTINUATION_BLOCK_TYPE,
} from './blocks/storyContinuationBlock';
import {
  getSceneStartBlockId,
  SCENE_START_BLOCK_TYPE,
} from './blocks/sceneStartBlock';
import {
  LOGIC_CONTROL_FIELDS,
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  setLogicControlMarkers,
  setLogicIfBlockCondition,
} from './blocks/logicControlBlock';
import {
  setVariableBlockNode,
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from './blocks/variableBlock';
import {
  CG_DISPLAY_BLOCK_TYPE,
  CG_DISPLAY_INPUTS,
  setCgDisplayBlockNode,
  setCgDisplayMarkers,
} from './blocks/cgDisplayBlock';
import type { WorkspacePoint } from './blockEditorLayout';
import { SingleDialogueBlockDragStrategy } from './singleDialogueBlockDragStrategy';
import { parseLogicStructure, type LogicStructureItem } from './logicStructure';

const FIRST_BLOCK_X = 48;
const FIRST_BLOCK_Y = 48;
const MIN_STORY_PAGE_COLUMN_STEP = 420;
const STORY_PAGE_COLUMN_GAP = 72;

type LogicStoryPage = {
  items: LogicStructureItem[];
  continuation: {
    node: Extract<SceneNode, { type: 'storyExtension' }>;
    sequence: number;
  } | null;
};

function paginateLogicItems(items: LogicStructureItem[]): LogicStoryPage[] {
  const pages: LogicStoryPage[] = [];
  let pageItems: LogicStructureItem[] = [];
  let continuation: LogicStoryPage['continuation'] = null;
  let continuationSequence = 0;

  const pushPage = (): void => {
    if (pageItems.length === 0 && continuation === null) {
      return;
    }
    pages.push({ items: pageItems, continuation });
    pageItems = [];
    continuation = null;
  };

  for (const item of items) {
    if (item.kind === 'node' && item.node.type === 'storyExtension') {
      pushPage();
      continuationSequence += 1;
      continuation = {
        node: item.node,
        sequence: continuationSequence,
      };
      continue;
    }

    pageItems.push(item);
    if (item.kind === 'node' && item.node.type === 'sceneJump') {
      pushPage();
    }
  }

  pushPage();
  return pages;
}

function connectBlocks(
  currentBlock: Blockly.BlockSvg,
  nextBlock: Blockly.BlockSvg,
  workspace: Blockly.WorkspaceSvg,
): void {
  const nextConnection = currentBlock.nextConnection;
  const previousConnection = nextBlock.previousConnection;
  if (!nextConnection || !previousConnection) {
    throw new Error('剧情积木缺少上下连接点');
  }
  if (!nextConnection.connect(previousConnection)) {
    throw new Error(`无法连接剧情节点：${currentBlock.id} -> ${nextBlock.id}`);
  }
  Blockly.renderManagement.triggerQueuedRenders(workspace);
}

function connectBlockChain(
  blocks: Blockly.BlockSvg[],
  workspace: Blockly.WorkspaceSvg,
): void {
  for (let index = blocks.length - 2; index >= 0; index -= 1) {
    connectBlocks(blocks[index], blocks[index + 1], workspace);
  }
}

function blockTypeForNode(node: SceneNode): string {
  switch (node.type) {
    case 'dialogue':
      return DIALOGUE_BLOCK_TYPE;
    case 'background':
      return BACKGROUND_BLOCK_TYPE;
    case 'character':
      return node.mode === 'clear'
        ? CLEAR_CHARACTER_BLOCK_TYPE
        : CHARACTER_BLOCK_TYPE;
    case 'sceneJump':
      return SCENE_JUMP_BLOCK_TYPE;
    case 'bgm':
      return BGM_BLOCK_TYPE;
    case 'video':
      return VIDEO_BLOCK_TYPE;
    case 'choice':
      return CHOICE_BLOCK_TYPE;
    case 'storyExtension':
      return STORY_CONTINUATION_BLOCK_TYPE;
    case 'variableSet':
      return VARIABLE_SET_BLOCK_TYPE;
    case 'variableChange':
      return VARIABLE_CHANGE_BLOCK_TYPE;
    case 'logicIf':
      return LOGIC_IF_BLOCK_TYPE;
    case 'logicRepeat':
      return LOGIC_REPEAT_BLOCK_TYPE;
    case 'cgDisplay':
      return CG_DISPLAY_BLOCK_TYPE;
    case 'logicElse':
    case 'logicEndIf':
    case 'logicEndRepeat':
    case 'cgEndDisplay':
      throw new Error(`内部逻辑标记不应显示为积木：${node.id}`);
  }
}

type ProjectionContext = {
  workspace: Blockly.WorkspaceSvg;
  assets: AssetDocument[];
  labels: EditorLabels;
  continuationSequences: Map<string, number>;
};

function createChoiceOptions(
  block: Blockly.BlockSvg,
  node: Extract<SceneNode, { type: 'choice' }>,
  context: ProjectionContext,
): void {
  const optionBlocks = node.options.map((option) => {
    const optionBlock = context.workspace.newBlock(
      CHOICE_OPTION_BLOCK_TYPE,
      option.id,
    );
    optionBlock.setMovable(true);
    optionBlock.setDeletable(false);
    optionBlock.setEditable(true);
    optionBlock.contextMenu = false;
    optionBlock.setDragStrategy(
      new SingleDialogueBlockDragStrategy(optionBlock),
    );
    optionBlock.initSvg();
    optionBlock.setFieldValue(option.text, CHOICE_OPTION_BLOCK_FIELDS.text);
    optionBlock.setFieldValue(
      option.targetSceneId,
      CHOICE_OPTION_BLOCK_FIELDS.targetScene,
    );
    optionBlock.render();
    return optionBlock;
  });

  connectBlockChain(optionBlocks, context.workspace);
  const firstOption = optionBlocks[0];
  if (!firstOption) {
    return;
  }
  const statementConnection = block.getInput(
    CHOICE_BLOCK_INPUTS.options,
  )?.connection;
  const previousConnection = firstOption.previousConnection;
  if (!statementConnection || !previousConnection) {
    throw new Error('选择容器缺少选项连接点');
  }
  if (!statementConnection.connect(previousConnection)) {
    throw new Error('无法把选择分支连接到选择容器');
  }
  Blockly.renderManagement.triggerQueuedRenders(context.workspace);
}

function createCharacterEffect(
  block: Blockly.BlockSvg,
  node: Extract<SceneNode, { type: 'character' }>,
  context: ProjectionContext,
): void {
  if (node.effect === null || node.assetId === null) {
    return;
  }
  const effectBlock = context.workspace.newBlock(
    characterEffectBlockType(node.effect),
    `${node.id}:effect`,
  );
  effectBlock.setMovable(true);
  effectBlock.setDeletable(false);
  effectBlock.setEditable(true);
  effectBlock.contextMenu = false;
  effectBlock.initSvg();
  setCharacterEffectBlock(effectBlock, node.effect);
  setCharacterEffectOwner(effectBlock, node.id);
  effectBlock.render();

  const inputConnection = block.getInput(
    CHARACTER_BLOCK_INPUTS.effect,
  )?.connection;
  if (!inputConnection || !effectBlock.outputConnection) {
    throw new Error(`人物立绘特效缺少右侧连接点：${node.id}`);
  }
  if (!inputConnection.connect(effectBlock.outputConnection)) {
    throw new Error(`无法连接人物立绘特效：${node.id}`);
  }
  Blockly.renderManagement.triggerQueuedRenders(context.workspace);
}

function createNodeBlock(
  node: SceneNode,
  context: ProjectionContext,
): Blockly.BlockSvg {
  const block = context.workspace.newBlock(blockTypeForNode(node), node.id);
  block.setMovable(node.type !== 'storyExtension');
  block.setDeletable(false);
  block.setEditable(true);
  block.contextMenu = false;
  block.setDragStrategy(new SingleDialogueBlockDragStrategy(block));
  block.initSvg();

  if (node.type === 'dialogue') {
    block.setFieldValue(node.speaker, DIALOGUE_BLOCK_FIELDS.speaker);
    block.setFieldValue(node.text, DIALOGUE_BLOCK_FIELDS.text);
    const voiceName =
      node.voiceAssetId === null
        ? ''
        : (context.assets.find((asset) => asset.id === node.voiceAssetId)
            ?.displayName ?? context.labels.common.missingAudio);
    setDialogueBlockVoice(block, node.voiceAssetId, voiceName);
  } else if (node.type === 'background') {
    const name =
      node.assetId === null
        ? ''
        : (context.assets.find((asset) => asset.id === node.assetId)
            ?.displayName ?? context.labels.common.missingImage);
    setBackgroundBlockAsset(block, node.assetId, name);
    setBackgroundBlockScalePercent(block, node.scalePercent);
  } else if (node.type === 'character') {
    if (node.mode === 'show') {
      const name =
        node.assetId === null
          ? context.labels.common.none
          : (context.assets.find((asset) => asset.id === node.assetId)
              ?.displayName ?? context.labels.common.missingImage);
      setCharacterBlockAsset(block, node.assetId, name);
      setCharacterBlockPosition(block, node.slot, node.position);
      setCharacterBlockScalePercent(block, node.scalePercent);
    }
    block.setFieldValue(String(node.layer), CHARACTER_BLOCK_FIELDS.layer);
  } else if (node.type === 'sceneJump') {
    block.setFieldValue(
      node.targetSceneId,
      SCENE_JUMP_BLOCK_FIELDS.targetScene,
    );
  } else if (node.type === 'bgm') {
    const name =
      node.assetId === null
        ? ''
        : (context.assets.find((asset) => asset.id === node.assetId)
            ?.displayName ?? context.labels.common.missingAudio);
    setBgmBlockAsset(block, node.assetId, name);
  } else if (node.type === 'video') {
    const name =
      node.assetId === null
        ? ''
        : (context.assets.find((asset) => asset.id === node.assetId)
            ?.displayName ?? context.labels.common.missingVideo);
    setVideoBlockAsset(block, node.assetId, name);
  } else if (node.type === 'storyExtension') {
    const sequence = context.continuationSequences.get(node.id);
    if (sequence === undefined) {
      throw new Error(`缺少延伸积木编号：${node.id}`);
    }
    setStoryContinuationBlockSequence(
      block,
      sequence,
      context.continuationSequences.size,
    );
  } else if (node.type === 'variableSet' || node.type === 'variableChange') {
    setVariableBlockNode(block, node);
  } else if (node.type === 'logicIf') {
    setLogicIfBlockCondition(block, node.condition);
  } else if (node.type === 'logicRepeat') {
    block.setFieldValue(String(node.count), LOGIC_CONTROL_FIELDS.count);
  } else if (node.type === 'cgDisplay') {
    setCgDisplayBlockNode(block, node);
  }

  block.render();
  if (node.type === 'character') {
    createCharacterEffect(block, node, context);
  }
  if (node.type === 'choice') {
    createChoiceOptions(block, node, context);
  }
  return block;
}

function connectStatementInput(
  parent: Blockly.BlockSvg,
  inputName: string,
  childBlocks: Blockly.BlockSvg[],
  workspace: Blockly.WorkspaceSvg,
): void {
  connectBlockChain(childBlocks, workspace);
  const firstChild = childBlocks[0];
  if (!firstChild) {
    return;
  }
  const inputConnection = parent.getInput(inputName)?.connection;
  if (!inputConnection || !firstChild.previousConnection) {
    throw new Error(`逻辑积木缺少内部连接点：${parent.id}`);
  }
  if (!inputConnection.connect(firstChild.previousConnection)) {
    throw new Error(`无法连接逻辑积木内容：${parent.id}`);
  }
  Blockly.renderManagement.triggerQueuedRenders(workspace);
}

function projectItem(
  item: LogicStructureItem,
  context: ProjectionContext,
): Blockly.BlockSvg {
  if (item.kind === 'node') {
    return createNodeBlock(item.node, context);
  }

  const block = createNodeBlock(item.node, context);
  if (item.kind === 'if') {
    setLogicControlMarkers(block, {
      kind: 'if',
      elseNodeId: item.elseNode.id,
      endNodeId: item.endNode.id,
    });
    connectStatementInput(
      block,
      LOGIC_CONTROL_INPUTS.then,
      item.thenItems.map((child) => projectItem(child, context)),
      context.workspace,
    );
    connectStatementInput(
      block,
      LOGIC_CONTROL_INPUTS.else,
      item.elseItems.map((child) => projectItem(child, context)),
      context.workspace,
    );
  } else if (item.kind === 'repeat') {
    setLogicControlMarkers(block, {
      kind: 'repeat',
      endNodeId: item.endNode.id,
    });
    connectStatementInput(
      block,
      LOGIC_CONTROL_INPUTS.body,
      item.bodyItems.map((child) => projectItem(child, context)),
      context.workspace,
    );
  } else {
    setCgDisplayMarkers(block, {
      endNodeId: item.endNode.id,
    });
    connectStatementInput(
      block,
      CG_DISPLAY_INPUTS.body,
      item.bodyItems.map((child) => projectItem(child, context)),
      context.workspace,
    );
  }
  return block;
}

// C++ Scene is authoritative. Paired logic markers are parsed into Blockly's
// nested C blocks and are intentionally never exposed as selectable blocks.
export function projectSceneToWorkspace(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
  rootPosition: WorkspacePoint = {
    x: FIRST_BLOCK_X,
    y: FIRST_BLOCK_Y,
  },
  assets: AssetDocument[] = [],
  labels: EditorLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE),
): void {
  Blockly.Events.disable();

  try {
    workspace.clear();
    const structure = parseLogicStructure(scene);
    const pages = paginateLogicItems(structure);
    const continuationSequences = new Map(
      pages.flatMap((page) =>
        page.continuation
          ? [[page.continuation.node.id, page.continuation.sequence] as const]
          : [],
      ),
    );
    const context: ProjectionContext = {
      workspace,
      assets,
      labels,
      continuationSequences,
    };

    const startBlock = workspace.newBlock(
      SCENE_START_BLOCK_TYPE,
      getSceneStartBlockId(scene.id),
    );
    startBlock.setMovable(false);
    startBlock.setDeletable(false);
    startBlock.setEditable(false);
    startBlock.contextMenu = false;
    startBlock.initSvg();
    startBlock.render();

    const pageRoots: Blockly.BlockSvg[] = [startBlock];
    pages.forEach((page, pageIndex) => {
      const pageBlocks = page.items.map((item) => projectItem(item, context));
      if (page.continuation) {
        pageBlocks.unshift(createNodeBlock(page.continuation.node, context));
      } else if (pageIndex === 0) {
        pageBlocks.unshift(startBlock);
      }

      connectBlockChain(pageBlocks, workspace);
      const pageRoot = pageBlocks[0];
      if (pageRoot && pageRoot !== startBlock) {
        pageRoots.push(pageRoot);
      }
    });

    let nextPageX = rootPosition.x;
    pageRoots.forEach((pageRoot, pageIndex) => {
      pageRoot.moveBy(nextPageX, rootPosition.y);
      if (pageIndex < pageRoots.length - 1) {
        const pageWidth = pageRoot.getBoundingRectangle().getWidth();
        nextPageX += Math.max(
          MIN_STORY_PAGE_COLUMN_STEP,
          pageWidth + STORY_PAGE_COLUMN_GAP,
        );
      }
    });
  } finally {
    Blockly.Events.enable();
    workspace.clearUndo();
  }

  workspace.resizeContents();
}
