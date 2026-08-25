import { ipcMain } from 'electron';

import { EXPORT_GAME_IPC_CHANNEL } from '../../shared/exportProtocol';
import { runExportGameWorkflow } from '../export/ExportGameWorkflow';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import type { EditorWindowContexts } from '../window/EditorWindowContext';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { isExportGameInvocation } from './validateExportInvocation';

export function registerExportIpc(
  contexts: EditorWindowContexts,
  trustedEditorLocations: TrustedEditorLocations,
  getLanguage: () => EditorLanguage = () => 'zh-CN',
): void {
  ipcMain.handle(
    EXPORT_GAME_IPC_CHANNEL,
    async (event, invocation: unknown) => {
      if (!isTrustedEditorFrame(event, trustedEditorLocations)) {
        throw new Error('拒绝来自非编辑器主页面的游戏导出请求');
      }
      if (!isExportGameInvocation(invocation)) {
        throw new Error('Renderer 发来了无效的游戏导出请求');
      }
      const context = contexts.get(event.sender.id);
      if (!context) {
        throw new Error('找不到当前编辑器窗口对应的项目会话');
      }
      return context.fileOperationCoordinator.runExclusive(() =>
        runExportGameWorkflow(context, invocation.params, getLanguage()),
      );
    },
  );
}
