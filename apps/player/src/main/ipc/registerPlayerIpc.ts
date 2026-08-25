import type { IpcMain } from 'electron';
import { isGameRuntimeSnapshot } from '@vnengine/runtime';

import {
  isPlayerSettingsPatch,
  PLAYER_IPC_CHANNEL,
  type PlayerInvocation,
  type PlayerLoadResult,
  type PlayerOpenResult,
  type PlayerSaveListResult,
  type PlayerSaveLoadResult,
  type PlayerSaveWriteResult,
  type PlayerSettingsReadResult,
  type PlayerSettingsWriteResult,
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
  if (
    value.action === 'load-game' ||
    value.action === 'open-game' ||
    value.action === 'quit-game' ||
    value.action === 'list-save-slots' ||
    value.action === 'quick-load' ||
    value.action === 'get-settings'
  ) {
    return hasExactFields(value.params, []);
  }
  if (value.action === 'update-settings') {
    return hasExactFields(value.params, ['patch']) &&
      isPlayerSettingsPatch(value.params.patch);
  }
  if (value.action === 'save-game') {
    return hasExactFields(value.params, ['slotId', 'snapshot']) &&
      (value.params.slotId === 1 ||
        value.params.slotId === 2 ||
        value.params.slotId === 3) &&
      isGameRuntimeSnapshot(value.params.snapshot);
  }
  if (value.action === 'load-game-slot') {
    return hasExactFields(value.params, ['slotId']) &&
      (value.params.slotId === 1 ||
        value.params.slotId === 2 ||
        value.params.slotId === 3);
  }
  if (value.action === 'quick-save') {
    return hasExactFields(value.params, ['snapshot']) &&
      isGameRuntimeSnapshot(value.params.snapshot);
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
  quitPlayer: () => void,
): void {
  ipcMain.handle(
    PLAYER_IPC_CHANNEL,
    (
      event: Electron.IpcMainInvokeEvent,
      invocation: unknown,
    ):
      | PlayerLoadResult
      | PlayerOpenResult
      | Promise<PlayerOpenResult>
      | Promise<PlayerSaveListResult>
      | Promise<PlayerSaveWriteResult>
      | Promise<PlayerSaveLoadResult>
      | Promise<PlayerSettingsReadResult>
      | Promise<PlayerSettingsWriteResult>
      | string
      | null
      | void => {
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
      if (invocation.action === 'quit-game') {
        quitPlayer();
        return;
      }
      if (invocation.action === 'get-media-url') {
        return context.bundleSession.getMediaUrl(invocation.params.assetId);
      }
      if (invocation.action === 'get-settings') {
        return context.settingsController.getSettings();
      }
      if (invocation.action === 'update-settings') {
        return context.settingsController.updateSettings(invocation.params.patch);
      }

      const active = context.bundleSession.getActiveGameContext();
      if (active === null) {
        return Promise.resolve({
          status: 'rejected' as const,
          error: '当前没有已加载的游戏',
        });
      }
      const isCurrent = () => context.bundleSession.isActiveGameContext(active);
      if (invocation.action === 'list-save-slots') {
        return context.saveStore.list(active, isCurrent);
      }
      if (invocation.action === 'save-game') {
        return context.saveStore.write(
          active,
          invocation.params.slotId,
          invocation.params.snapshot,
          isCurrent,
        );
      }
      if (invocation.action === 'load-game-slot') {
        return context.saveStore.load(active, invocation.params.slotId, isCurrent);
      }
      if (invocation.action === 'quick-save') {
        return context.saveStore.write(
          active,
          'quick',
          invocation.params.snapshot,
          isCurrent,
        );
      }
      return context.saveStore.load(active, 'quick', isCurrent);
    },
  );
}
