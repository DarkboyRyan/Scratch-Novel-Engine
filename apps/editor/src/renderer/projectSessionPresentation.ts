export function projectWindowTitle(
  projectName: string,
  filePath: string | null,
  isDirty: boolean,
): string {
  const dirtyMark = isDirty ? '● ' : '';
  const unsavedLabel = filePath ? '' : ' [未保存]';
  return `${dirtyMark}${projectName}${unsavedLabel} — VN Engine Editor`;
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
