import { contextBridge, ipcRenderer } from 'electron';

import {
  PLAYER_IPC_CHANNEL,
  type PlayerInvocation,
  type PlayerLoadResult,
  type PlayerOpenResult,
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
  quitGame: () =>
    invokePlayer({ action: 'quit-game', params: {} }) as Promise<void>,
};

contextBridge.exposeInMainWorld('vnPlayer', vnPlayer);
