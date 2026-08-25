import type {
  GameRuntimeSnapshot,
  ProjectDocument,
} from '@vnengine/runtime';
import type { MediaUrlResolver } from '@vnengine/player-ui';
import type {
  PlayerManualSaveSlotId,
  PlayerMode,
  PlayerSaveListResult,
  PlayerSaveLoadResult,
  PlayerSaveWriteResult,
  PlayerSettingsReadResult,
  PlayerSettingsPatch,
  PlayerSettingsWriteResult,
} from '../shared/playerProtocol';

export type PlayerAssetView = {
  id: string;
  type: 'image' | 'audio' | 'video';
  displayName: string;
};

export type PlayerGameView = {
  project: ProjectDocument;
  assets: readonly PlayerAssetView[];
};

export type PlayerLoadViewResult =
  | { status: 'loaded'; mode: PlayerMode; game: PlayerGameView }
  | { status: 'empty'; mode: PlayerMode }
  | { status: 'error'; mode: PlayerMode; error: string };

export type PlayerOpenViewResult =
  | { status: 'opened'; game: PlayerGameView }
  | { status: 'canceled' }
  | { status: 'rejected'; error: string };

// Renderer owns this narrow port, while preload owns the concrete transport.
// Tests and future web players can provide the same shape without Electron.
export type PlayerGateway = {
  loadGame(): Promise<PlayerLoadViewResult>;
  openGame(): Promise<PlayerOpenViewResult>;
  listSaveSlots(): Promise<PlayerSaveListResult>;
  saveGame(
    slotId: PlayerManualSaveSlotId,
    snapshot: GameRuntimeSnapshot,
  ): Promise<PlayerSaveWriteResult>;
  loadGameSlot(slotId: PlayerManualSaveSlotId): Promise<PlayerSaveLoadResult>;
  quickSave(snapshot: GameRuntimeSnapshot): Promise<PlayerSaveWriteResult>;
  quickLoad(): Promise<PlayerSaveLoadResult>;
  getSettings(): Promise<PlayerSettingsReadResult>;
  updateSettings(
    patch: PlayerSettingsPatch,
  ): Promise<PlayerSettingsWriteResult>;
  resolveMediaUrl: MediaUrlResolver;
  quit(): Promise<void>;
};

export const preloadPlayerGateway: PlayerGateway = {
  loadGame: () => window.vnPlayer.loadGame(),
  openGame: () => window.vnPlayer.openGame(),
  listSaveSlots: () => window.vnPlayer.listSaveSlots(),
  saveGame: (slotId, snapshot) => window.vnPlayer.saveGame(slotId, snapshot),
  loadGameSlot: (slotId) => window.vnPlayer.loadGameSlot(slotId),
  quickSave: (snapshot) => window.vnPlayer.quickSave(snapshot),
  quickLoad: () => window.vnPlayer.quickLoad(),
  getSettings: () => window.vnPlayer.getSettings(),
  updateSettings: (patch) => window.vnPlayer.updateSettings(patch),
  resolveMediaUrl: (assetId) => window.vnPlayer.getMediaUrl(assetId),
  quit: () => window.vnPlayer.quitGame(),
};
