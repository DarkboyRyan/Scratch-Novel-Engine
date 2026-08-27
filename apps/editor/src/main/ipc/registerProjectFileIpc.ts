// 主要作用：注册项目新建、打开、保存和会话查询的 IPC 入口。
// 关键实现：registerProjectFileIpc 校验 Frame 并调用窗口级文件工作流。
import { ipcMain } from 'electron';

import { PROJECT_FILE_IPC_CHANNEL } from '../../shared/projectFileProtocol';
import {
  runProjectFileWorkflow,
  type OpenNewProjectWindow,
} from '../project/ProjectFileWorkflow';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import type { EditorWindowContexts } from '../window/EditorWindowContext';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { isProjectFileInvocation } from './validateProjectFileInvocation';

export type { OpenNewProjectWindow } from '../project/ProjectFileWorkflow';

export function registerProjectFileIpc(
  contexts: EditorWindowContexts,
  trustedEditorLocations: TrustedEditorLocations,
  openNewProjectWindow: OpenNewProjectWindow,
  getLanguage: () => EditorLanguage = () => 'zh-CN',
): void {
  ipcMain.handle(
    PROJECT_FILE_IPC_CHANNEL,
    async (event, invocation: unknown) => {
      if (!isTrustedEditorFrame(event, trustedEditorLocations)) {
        throw new Error('拒绝来自非编辑器主页面的项目文件请求');
      }

      if (!isProjectFileInvocation(invocation)) {
        throw new Error('Renderer 发来了无效的项目文件请求');
      }

      const context = contexts.get(event.sender.id);
      if (!context) {
        throw new Error('找不到当前编辑器窗口对应的项目会话');
      }

      return runProjectFileWorkflow(
        context,
        invocation,
        openNewProjectWindow,
        getLanguage(),
      );
    },
  );
}
