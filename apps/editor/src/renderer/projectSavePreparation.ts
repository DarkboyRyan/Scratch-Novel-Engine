/**
 * 文件主要作用：在保存前同步当前编辑模式中的草稿并返回可保存状态。
 * 包含实现：`prepareProjectSave`。
 */

import type { EditorMode } from './application/editorMode';

type PrepareProjectSaveOptions = {
  editorMode: EditorMode;
  flushBlockDraft: () => Promise<boolean>;
  flushCodeDraft: () => Promise<boolean>;
  hasUnappliedCodeDrafts?: () => boolean;
  commitProjectName: () => Promise<boolean>;
  commitFormDraft: () => Promise<boolean>;
};

// 磁盘保存只能在所有可见草稿已进入 C++ 后开始。
// Blockly 放在项目名之前，因为项目重命名返回的快照会重绘
// workspace，过早重绘可能覆盖正在编辑的 Blockly 输入。
export async function prepareProjectSave({
  editorMode,
  flushBlockDraft,
  flushCodeDraft,
  hasUnappliedCodeDrafts = () => false,
  commitProjectName,
  commitFormDraft,
}: PrepareProjectSaveOptions): Promise<boolean> {
  if (editorMode === 'blocks' && !(await flushBlockDraft())) {
    return false;
  }
  if (editorMode === 'code' && !(await flushCodeDraft())) {
    return false;
  }
  // Code 草稿可暂时离开当前页面，但不会进入权威 Project。磁盘保存、
  // 导出、预览和资源导入共用这条严格边界，任何场景仍有未应用草稿时
  // 都不能静默使用旧权威版本继续。
  if (hasUnappliedCodeDrafts()) {
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
