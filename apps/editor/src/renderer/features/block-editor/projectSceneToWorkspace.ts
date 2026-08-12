import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import {
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
} from './blocks/dialogueBlock';

const FIRST_BLOCK_X = 48;
const FIRST_BLOCK_Y = 48;

// 把 C++ 返回的 Scene 快照绘制成 Blockly 积木。
// 本函数只读取 Scene，不修改 Scene，也不调用后端。
export function projectSceneToWorkspace(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
): void {
  // 程序创建积木时不要产生“用户编辑”事件。
  Blockly.Events.disable();

  try {
    // C++ Scene 是唯一数据源，所以先清除旧画面，
    // 再根据最新快照完整重建。
    workspace.clear();

    let previousBlock: Blockly.BlockSvg | null = null;

    for (const node of scene.nodes) {
      const block = workspace.newBlock(
        DIALOGUE_BLOCK_TYPE,
        node.id,
      );

      block.setMovable(false);
      block.setDeletable(false);
      block.setEditable(true);
      block.contextMenu = false;

      block.initSvg();

      block.setFieldValue(
        node.speaker,
        DIALOGUE_BLOCK_FIELDS.speaker,
      );

      block.setFieldValue(
        node.text,
        DIALOGUE_BLOCK_FIELDS.text,
      );

      block.render();

      if (previousBlock) {
        const nextConnection =
          previousBlock.nextConnection;
        const previousConnection =
          block.previousConnection;

        if (!nextConnection || !previousConnection) {
          throw new Error(
            '对白积木缺少上下连接点',
          );
        }

        const connected = nextConnection.connect(
          previousConnection,
        );

        if (!connected) {
          throw new Error(
            `无法连接对白：${previousBlock.id} -> ${block.id}`,
          );
        }
      } else {
        // 只定位第一块；后面的积木通过连接自动排列。
        block.moveBy(FIRST_BLOCK_X, FIRST_BLOCK_Y);
      }

      previousBlock = block;
    }
  } finally {
    Blockly.Events.enable();

    // C++ 快照投影不属于用户操作，不能被 Ctrl+Z 撤销。
    workspace.clearUndo();
  }

  workspace.resizeContents();
}
