/**
 * 文件主要作用：统一各 Blockly 编辑界面的工作区移动配置。
 * 包含实现：`BLOCKLY_WORKSPACE_MOVE_OPTIONS`。
 */

import type { BlocklyOptions } from 'blockly';

// 鼠标滚轮继续用于缩放；按住左键拖动空白画布时由 Blockly 原生手势平移。
export const BLOCKLY_WORKSPACE_MOVE_OPTIONS = {
  scrollbars: true,
  drag: true,
  wheel: false,
} satisfies NonNullable<BlocklyOptions['move']>;
