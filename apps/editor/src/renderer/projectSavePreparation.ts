/**
 * 文件主要作用：在保存前同步当前编辑模式中的草稿并返回可保存状态。
 * 包含实现：`prepareProjectSave`。
 */

import type { EditorMode } from './application/editorMode';

type PrepareProjectSaveOptions = {
  editorMode: EditorMode;
  flushBlockDraft: () => Promise<boolean>;
  commitProjectName: () => Promise<boolean>;
  commitFormDraft: () => Promise<boolean>;
};

// 磁盘保存只能在所有可见草稿已进入 C++ 后开始。
// Blockly 放在项目名之前，因为项目重命名返回的快照会重绘
// workspace，过早重绘可能覆盖正在编辑的 Blockly 输入。
export async function prepareProjectSave({
  editorMode,
  flushBlockDraft,
  commitProjectName,
  commitFormDraft,
}: PrepareProjectSaveOptions): Promise<boolean> {
  if (editorMode === 'blocks' && !(await flushBlockDraft())) {
    return false;
  }

  if (!(await commitProjectName())) {
    return false;
  }

  if (editorMode === 'form') {
    return commitFormDraft();
  }

  return true;
}
