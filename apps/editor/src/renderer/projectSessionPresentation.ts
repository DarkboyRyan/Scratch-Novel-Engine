/**
 * 文件主要作用：根据项目会话状态生成窗口标题与未保存标记。
 * 包含实现：`projectWindowTitle`、`projectSaveStatus`。
 */

export function projectWindowTitle(
  projectName: string,
  hasStorage: boolean,
  isDirty: boolean,
  unsavedLabel = '未保存',
): string {
  const dirtyMark = isDirty ? '● ' : '';
  const storageLabel = hasStorage ? '' : ` [${unsavedLabel}]`;
  return `${dirtyMark}${projectName}${storageLabel} — VN Engine Editor`;
}

export function projectSaveStatus(
  isSaving: boolean,
  isDirty: boolean,
): '正在保存…' | '未保存' | '已保存' {
  if (isSaving) {
    return '正在保存…';
  }
  return isDirty ? '未保存' : '已保存';
}
