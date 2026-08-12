import { ipcMain } from 'electron';

import { ENGINE_IPC_CHANNEL } from '../../shared/engineProtocol';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import type { EditorWindowContexts } from '../window/EditorWindowContext';
import { updateWindowDocumentPresentation } from '../window/updateWindowDocumentPresentation';
import { isEngineInvocation } from './validateEngineInvocation';

export function registerEngineIpc(
  contexts: EditorWindowContexts,
  trustedEditorLocations: TrustedEditorLocations,
): void {
  ipcMain.handle(
    ENGINE_IPC_CHANNEL,
    async (event, invocation: unknown) => {
      if (!isTrustedEditorFrame(event, trustedEditorLocations)) {
        throw new Error('拒绝来自非编辑器主页面的引擎请求');
      }

      if (!isEngineInvocation(invocation)) {
        throw new Error('Renderer 发来了无效的引擎请求');
      }

      const context = contexts.get(event.sender.id);
      if (!context) {
        throw new Error('找不到当前编辑器窗口对应的项目会话');
      }

      const result = await context.backendClient.request(invocation);
      const session = context.projectFileSession.updateEngineSession(
        result.session,
      );
      updateWindowDocumentPresentation(
        context.editorWindow,
        result.project.name,
        session,
      );

      return result;
    },
  );
}
