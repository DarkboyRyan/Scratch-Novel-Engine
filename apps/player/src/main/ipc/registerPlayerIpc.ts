import type { IpcMain } from 'electron';

import {
  PLAYER_IPC_CHANNEL,
  type PlayerInvocation,
  type PlayerLoadResult,
  type PlayerOpenResult,
} from '../../shared/playerProtocol';
import {
  isTrustedPlayerFrame,
  type TrustedPlayerLocations,
} from '../security/playerFrameTrust';
import type { PlayerWindowContexts } from '../window/PlayerWindowContext';

type IpcRegistrar = Pick<IpcMain, 'handle'>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  );
}

function isPlayerInvocation(value: unknown): value is PlayerInvocation {
  if (!isObject(value) || !hasExactFields(value, ['action', 'params'])) {
    return false;
  }
  if (!isObject(value.params)) {
    return false;
  }
  if (value.action === 'load-game' || value.action === 'open-game') {
    return hasExactFields(value.params, []);
  }
  return (
    value.action === 'get-media-url' &&
    hasExactFields(value.params, ['assetId']) &&
    typeof value.params.assetId === 'string' &&
    value.params.assetId.length > 0 &&
    value.params.assetId.length <= 256
  );
}

export function registerPlayerIpc(
  ipcMain: IpcRegistrar,
  contexts: PlayerWindowContexts,
  trustedLocations: TrustedPlayerLocations,
): void {
  ipcMain.handle(
    PLAYER_IPC_CHANNEL,
    (
      event: Electron.IpcMainInvokeEvent,
      invocation: unknown,
    ): PlayerLoadResult | PlayerOpenResult | Promise<PlayerOpenResult> | string | null => {
      if (!isTrustedPlayerFrame(event, trustedLocations)) {
        throw new Error('Player 请求来源不可信');
      }
      if (!isPlayerInvocation(invocation)) {
        throw new Error('Player 请求格式无效');
      }
      const context = contexts.get(event.sender.id);
      if (context === undefined) {
        throw new Error('Player 窗口会话不存在');
      }

      if (invocation.action === 'load-game') {
        return context.bundleSession.loadGame();
      }
      if (invocation.action === 'open-game') {
        return context.bundleSession.openGame();
      }
      return context.bundleSession.getMediaUrl(invocation.params.assetId);
    },
  );
}
