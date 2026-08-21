import * as Blockly from 'blockly';

import type {
  AssetDocument,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  BACKGROUND_BLOCK_TYPE,
  setBackgroundBlockAsset,
} from './blocks/backgroundBlock';
import {
  CHARACTER_BLOCK_FIELDS,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  setCharacterBlockAsset,
  setCharacterBlockPosition,
} from './blocks/characterBlock';
import {
  SCENE_JUMP_BLOCK_FIELDS,
  SCENE_JUMP_BLOCK_TYPE,
} from './blocks/sceneJumpBlock';
import {
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
  setDialogueBlockVoice,
} from './blocks/dialogueBlock';
import {
  BGM_BLOCK_TYPE,
  setBgmBlockAsset,
} from './blocks/bgmBlock';
import {
  VIDEO_BLOCK_TYPE,
  setVideoBlockAsset,
} from './blocks/videoBlock';
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
import type { WorkspacePoint } from './blockEditorLayout';
import { SingleDialogueBlockDragStrategy } from './singleDialogueBlockDragStrategy';
import { paginateStoryNodes } from './storyBlockPagination';

const FIRST_BLOCK_X = 48;
const FIRST_BLOCK_Y = 48;
const MIN_STORY_PAGE_COLUMN_STEP = 420;
const STORY_PAGE_COLUMN_GAP = 72;

// 把 C++ 返回的 Scene 快照绘制成 Blockly 积木。
// 本函数只读取 Scene，不修改 Scene，也不调用后端。
export function projectSceneToWorkspace(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
  rootPosition: WorkspacePoint = {
    x: FIRST_BLOCK_X,
    y: FIRST_BLOCK_Y,
  },
  assets: AssetDocument[] = [],
): void {
  // 程序创建积木时不要产生“用户编辑”事件。
  Blockly.Events.disable();

  try {
    // C++ Scene 是唯一数据源，所以先清除旧画面，
    // 再根据最新快照完整重建。
    workspace.clear();

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

    const blocks: Blockly.BlockSvg[] = [];
    const storyPages = paginateStoryNodes(scene.nodes);
    const continuationSequences = new Map(
      storyPages.flatMap((page) =>
        page.continuation
          ? [[page.continuation.node.id, page.continuation.sequence] as const]
          : [],
      ),
    );

    for (const node of scene.nodes) {
      const block = workspace.newBlock(
        node.type === 'dialogue'
          ? DIALOGUE_BLOCK_TYPE
          : node.type === 'background'
            ? BACKGROUND_BLOCK_TYPE
            : node.type === 'character'
              ? node.assetId === null
                ? CLEAR_CHARACTER_BLOCK_TYPE
                : CHARACTER_BLOCK_TYPE
              : node.type === 'sceneJump'
                ? SCENE_JUMP_BLOCK_TYPE
                : node.type === 'bgm'
                  ? BGM_BLOCK_TYPE
                  : node.type === 'video'
                    ? VIDEO_BLOCK_TYPE
                    : node.type === 'choice'
                      ? CHOICE_BLOCK_TYPE
                      : STORY_CONTINUATION_BLOCK_TYPE,
        node.id,
      );

      // 延伸的页序只能通过数字字段改变；禁止单块拖拽
      // 可避免只移动 marker 而把该页内容留在原地。
      block.setMovable(node.type !== 'storyExtension');
      // Delete/垃圾桶由 backend-first 控件接管，不能让 Blockly 先删。
      block.setDeletable(false);
      block.setEditable(true);
      block.contextMenu = false;
      block.setDragStrategy(
        new SingleDialogueBlockDragStrategy(block),
      );

      block.initSvg();

      if (node.type === 'dialogue') {
        block.setFieldValue(
          node.speaker,
          DIALOGUE_BLOCK_FIELDS.speaker,
        );
        block.setFieldValue(
          node.text,
          DIALOGUE_BLOCK_FIELDS.text,
        );
        const voiceName =
          node.voiceAssetId === null
            ? ''
            : assets.find((asset) => asset.id === node.voiceAssetId)
                ?.displayName ?? '缺失音频';
        setDialogueBlockVoice(block, node.voiceAssetId, voiceName);
      } else if (node.type === 'background') {
        const name =
          node.assetId === null
            ? ''
            : assets.find((asset) => asset.id === node.assetId)
                ?.displayName ?? '缺失图片';
        setBackgroundBlockAsset(block, node.assetId, name);
      } else if (node.type === 'character') {
        if (node.assetId !== null) {
          const name =
            assets.find((asset) => asset.id === node.assetId)
              ?.displayName ?? '缺失图片';
          setCharacterBlockAsset(block, node.assetId, name);
          setCharacterBlockPosition(block, node.slot, node.position);
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
            : assets.find((asset) => asset.id === node.assetId)
                ?.displayName ?? '缺失音频';
        setBgmBlockAsset(block, node.assetId, name);
      } else if (node.type === 'video') {
        const name =
          node.assetId === null
            ? ''
            : assets.find((asset) => asset.id === node.assetId)
                ?.displayName ?? '缺失视频';
        setVideoBlockAsset(block, node.assetId, name);
      } else if (node.type === 'storyExtension') {
        const continuationSequence = continuationSequences.get(node.id);
        if (continuationSequence === undefined) {
          throw new Error(`缺少延伸积木编号：${node.id}`);
        }
        setStoryContinuationBlockSequence(
          block,
          continuationSequence,
          continuationSequences.size,
        );
      }

      block.render();

      if (node.type === 'choice') {
        const optionBlocks = node.options.map((option) => {
          const optionBlock = workspace.newBlock(
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
          optionBlock.setFieldValue(
            option.text,
            CHOICE_OPTION_BLOCK_FIELDS.text,
          );
          optionBlock.setFieldValue(
            option.targetSceneId,
            CHOICE_OPTION_BLOCK_FIELDS.targetScene,
          );
          optionBlock.render();
          return optionBlock;
        });

        for (
          let index = optionBlocks.length - 2;
          index >= 0;
          index -= 1
        ) {
          const nextConnection = optionBlocks[index].nextConnection;
          const previousConnection =
            optionBlocks[index + 1].previousConnection;
          if (!nextConnection || !previousConnection) {
            throw new Error('选择分支积木缺少上下连接点');
          }
          const connected = nextConnection.connect(previousConnection);
          if (!connected) {
            throw new Error('无法连接选择分支积木');
          }
          Blockly.renderManagement.triggerQueuedRenders(workspace);
        }

        const firstOption = optionBlocks[0];
        if (firstOption) {
          const statementConnection = block.getInput(
            CHOICE_BLOCK_INPUTS.options,
          )?.connection;
          const previousConnection = firstOption.previousConnection;
          if (!statementConnection || !previousConnection) {
            throw new Error('选择容器缺少选项连接点');
          }
          const connected = statementConnection.connect(
            previousConnection,
          );
          if (!connected) {
            throw new Error('无法把选择分支连接到选择容器');
          }
          Blockly.renderManagement.triggerQueuedRenders(workspace);
        }
      }

      blocks.push(block);
    }

    const blocksByNodeId = new Map(
      blocks.map((block) => [block.id, block]),
    );
    const pageRoots: Blockly.BlockSvg[] = [startBlock];

    storyPages.forEach((page, pageIndex) => {
      const pageBlocks: Blockly.BlockSvg[] = [];

      // 第一段直接从固定“开始”积木向下连接。若作者把“延伸”
      // 放在最前面，它仍作为下一列页首，开始积木保持独立首列。
      if (pageIndex === 0 && page.continuation === null) {
        pageBlocks.push(startBlock);
      }

      if (page.continuation) {
        const continuationBlock = blocksByNodeId.get(
          page.continuation.node.id,
        );
        if (!continuationBlock) {
          throw new Error(
            `缺少延伸积木：${page.continuation.node.id}`,
          );
        }
        pageBlocks.push(continuationBlock);
      }

      pageBlocks.push(...page.nodes.map((node) => {
        const block = blocksByNodeId.get(node.id);
        if (!block) {
          throw new Error(`缺少剧情节点积木：${node.id}`);
        }
        return block;
      }));

      // 从链尾向前连接：后一块先形成稳定的子链，再整体接到前一块。
      // 这样不会在 Blockly 尚未完成父块重绘时读取过期的 next 坐标。
      for (
        let index = pageBlocks.length - 2;
        index >= 0;
        index -= 1
      ) {
        const currentBlock = pageBlocks[index];
        const nextBlock = pageBlocks[index + 1];
        const nextConnection = currentBlock.nextConnection;
        const previousConnection = nextBlock.previousConnection;

        if (!nextConnection || !previousConnection) {
          throw new Error('剧情积木缺少上下连接点');
        }

        const connected = nextConnection.connect(previousConnection);

        if (!connected) {
          throw new Error(
            `无法连接剧情节点：${currentBlock.id} -> ${nextBlock.id}`,
          );
        }

        // connect 会把子块的定位放入 Blockly 渲染队列。这里同步刷新，
        // 避免下一次连接仍读取 (0, 0) 而让多块对白叠在一起。
        Blockly.renderManagement.triggerQueuedRenders(workspace);
      }

      const pageRoot = pageBlocks[0];
      if (pageRoot && pageRoot !== startBlock) {
        pageRoots.push(pageRoot);
      }
    });

    // 每段剧情作为独立顶层链横向排列。宽积木使用实际包围盒增加列距，
    // 确保长对白和 Choice 选项不会覆盖下一段。
    let nextPageX = rootPosition.x;
    pageRoots.forEach((pageRoot, pageIndex) => {
      pageRoot.moveBy(nextPageX, rootPosition.y);
      if (pageIndex < pageRoots.length - 1) {
        const pageWidth = pageRoot
          .getBoundingRectangle()
          .getWidth();
        nextPageX += Math.max(
          MIN_STORY_PAGE_COLUMN_STEP,
          pageWidth + STORY_PAGE_COLUMN_GAP,
        );
      }
    });
  } finally {
    Blockly.Events.enable();

    // C++ 快照投影不属于用户操作，不能被 Ctrl+Z 撤销。
    workspace.clearUndo();
  }

  workspace.resizeContents();
}
