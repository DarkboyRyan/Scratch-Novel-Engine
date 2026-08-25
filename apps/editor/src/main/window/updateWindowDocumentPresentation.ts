import type { BrowserWindow } from 'electron';

import type { ProjectFileSessionSnapshot } from '../../shared/projectFileProtocol';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { getEditorNativeLabels } from '../i18n/editorNativeLabels';

const PRODUCT_NAME = 'VN Engine Editor';

export function updateWindowDocumentPresentation(
  editorWindow: BrowserWindow,
  projectName: string,
  session: ProjectFileSessionSnapshot,
  language: EditorLanguage = 'zh-CN',
): void {
  const labels = getEditorNativeLabels(language).window;
  const safeProjectName = projectName.trim() || labels.untitledProject;
  const dirtyMark = session.isDirty ? '● ' : '';
  const unsavedLabel = session.hasStorage ? '' : ` [${labels.unsaved}]`;

  editorWindow.setTitle(
    `${dirtyMark}${safeProjectName}${unsavedLabel} — ${PRODUCT_NAME}`,
  );

  // 这两个 API 在 macOS 上会显示原生的“文档已编辑”标记和文件代理图标。
  editorWindow.setDocumentEdited(session.isDirty);
  // The public session deliberately carries no native path. Main callers can
  // continue to mark edit state without leaking a path through Renderer IPC.
  editorWindow.setRepresentedFilename('');
}
