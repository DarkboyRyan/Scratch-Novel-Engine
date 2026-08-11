import { ipcMain } from 'electron';

import { ENGINE_IPC_CHANNEL } from '../../shared/engineProtocol';
import type { BackendClient } from '../backend/backendClient';
import { isEngineInvocation } from './validateEngineInvocation';

export function registerEngineIpc(
  backendClient: BackendClient,
  trustedWebContentsIds: ReadonlySet<number>,
): void {
  ipcMain.handle(
    ENGINE_IPC_CHANNEL,
    async (event, invocation: unknown) => {
      const isTrustedMainFrame =
        trustedWebContentsIds.has(event.sender.id) &&
        event.senderFrame === event.sender.mainFrame;

      if (!isTrustedMainFrame) {
        throw new Error('拒绝来自非编辑器主页面的引擎请求');
      }

      if (!isEngineInvocation(invocation)) {
        throw new Error('Renderer 发来了无效的引擎请求');
      }

      return backendClient.request(invocation);
    },
  );
}
