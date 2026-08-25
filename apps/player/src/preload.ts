import { contextBridge, ipcRenderer } from 'electron';

import {
  PLAYER_IPC_CHANNEL,
  type PlayerInvocation,
  type PlayerLoadResult,
  type PlayerOpenResult,
  type PlayerSaveListResult,
  type PlayerSaveLoadResult,
  type PlayerSaveWriteResult,
  type PlayerSettingsReadResult,
  type PlayerSettingsWriteResult,
  type VnPlayerApi,
} from './shared/playerProtocol';

function invokePlayer(invocation: PlayerInvocation): Promise<unknown> {
  return ipcRenderer.invoke(PLAYER_IPC_CHANNEL, invocation);
}

const vnPlayer: VnPlayerApi = {
  loadGame: () =>
    invokePlayer({ action: 'load-game', params: {} }) as Promise<PlayerLoadResult>,
  openGame: () =>
    invokePlayer({ action: 'open-game', params: {} }) as Promise<PlayerOpenResult>,
  getMediaUrl: (assetId) =>
    invokePlayer({
      action: 'get-media-url',
      params: { assetId },
    }) as Promise<string | null>,
  listSaveSlots: () =>
    invokePlayer({
      action: 'list-save-slots',
      params: {},
    }) as Promise<PlayerSaveListResult>,
  saveGame: (slotId, snapshot) =>
    invokePlayer({
      action: 'save-game',
      params: { slotId, snapshot },
    }) as Promise<PlayerSaveWriteResult>,
  loadGameSlot: (slotId) =>
    invokePlayer({
      action: 'load-game-slot',
      params: { slotId },
    }) as Promise<PlayerSaveLoadResult>,
  quickSave: (snapshot) =>
    invokePlayer({
      action: 'quick-save',
      params: { snapshot },
    }) as Promise<PlayerSaveWriteResult>,
  quickLoad: () =>
    invokePlayer({
      action: 'quick-load',
      params: {},
    }) as Promise<PlayerSaveLoadResult>,
  getSettings: () =>
    invokePlayer({
      action: 'get-settings',
      params: {},
    }) as Promise<PlayerSettingsReadResult>,
  updateSettings: (patch) =>
    invokePlayer({
      action: 'update-settings',
      params: { patch },
    }) as Promise<PlayerSettingsWriteResult>,
  quitGame: () =>
    invokePlayer({ action: 'quit-game', params: {} }) as Promise<void>,
};

contextBridge.exposeInMainWorld('vnPlayer', vnPlayer);
