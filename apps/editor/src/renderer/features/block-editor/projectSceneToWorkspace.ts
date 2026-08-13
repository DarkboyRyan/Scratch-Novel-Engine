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
  setCharacterBlockAsset,
} from './blocks/characterBlock';
import {
  SCENE_JUMP_BLOCK_FIELDS,
  SCENE_JUMP_BLOCK_TYPE,
} from './blocks/sceneJumpBlock';
import {
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
} from './blocks/dialogueBlock';
import type { WorkspacePoint } from './blockEditorLayout';
import { SingleDialogueBlockDragStrategy } from './singleDialogueBlockDragStrategy';

const FIRST_BLOCK_X = 48;
const FIRST_BLOCK_Y = 48;

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

    const blocks: Blockly.BlockSvg[] = [];

    for (const node of scene.nodes) {
      const block = workspace.newBlock(
        node.type === 'dialogue'
          ? DIALOGUE_BLOCK_TYPE
          : node.type === 'background'
            ? BACKGROUND_BLOCK_TYPE
            : node.type === 'character'
              ? CHARACTER_BLOCK_TYPE
              : SCENE_JUMP_BLOCK_TYPE,
        node.id,
      );

      block.setMovable(true);
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
      } else if (node.type === 'background') {
        const name =
          node.assetId === null
            ? ''
            : assets.find((asset) => asset.id === node.assetId)
                ?.displayName ?? '缺失图片';
        setBackgroundBlockAsset(block, node.assetId, name);
      } else if (node.type === 'character') {
        const name =
          node.assetId === null
            ? ''
            : assets.find((asset) => asset.id === node.assetId)
                ?.displayName ?? '缺失图片';
        setCharacterBlockAsset(block, node.assetId, name);
        block.setFieldValue(node.slot, CHARACTER_BLOCK_FIELDS.slot);
        block.setFieldValue(String(node.layer), CHARACTER_BLOCK_FIELDS.layer);
      } else {
        block.setFieldValue(
          node.targetSceneId,
          SCENE_JUMP_BLOCK_FIELDS.targetScene,
        );
      }

      block.render();
      blocks.push(block);
    }

    // 从链尾向前连接：后一块先形成稳定的子链，再整体接到前一块。
    // 这样不会在 Blockly 尚未完成父块重绘时读取过期的 next 坐标。
    for (let index = blocks.length - 2; index >= 0; index -= 1) {
      const currentBlock = blocks[index];
      const nextBlock = blocks[index + 1];
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

    // 只定位第一块；后面的积木通过连接作为一条链一起移动。
    blocks[0]?.moveBy(rootPosition.x, rootPosition.y);
  } finally {
    Blockly.Events.enable();

    // C++ 快照投影不属于用户操作，不能被 Ctrl+Z 撤销。
    workspace.clearUndo();
  }

  workspace.resizeContents();
}
