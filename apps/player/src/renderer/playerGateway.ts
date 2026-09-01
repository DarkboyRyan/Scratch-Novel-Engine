/**
 * 主要作用：定义 UI 与宿主能力之间的 PlayerGateway 边界及 Preload 实现。
 * 关键函数与实现：`PlayerAssetView`、`PlayerGameView`、`PlayerLoadViewResult`、`PlayerOpenViewResult`；以 TypeScript 类型边界和可组合函数实现。
 */
import type {
  GameRuntimeSnapshot,
  ProjectDocument,
} from '@vnengine/runtime';
import type { MediaUrlResolver } from '@vnengine/player-ui';
import type {
  PlayerManualSaveSlotId,
  PlayerErrorCode,
  PlayerLanguage,
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
  defaultLanguage: PlayerLanguage;
  project: ProjectDocument;
  assets: readonly PlayerAssetView[];
};

export type PlayerLoadViewResult =
  | { status: 'loaded'; mode: PlayerMode; game: PlayerGameView }
  | { status: 'empty'; mode: PlayerMode }
  | { status: 'error'; mode: PlayerMode; error: PlayerErrorCode };

export type PlayerOpenViewResult =
  | { status: 'opened'; game: PlayerGameView }
  | { status: 'canceled' }
  | { status: 'rejected'; error: PlayerErrorCode };

// Renderer owns this narrow port, while preload owns the concrete transport.
// Tests and future web players can provide the same shape without Electron.
export type PlayerGateway = {
  // Omitted capabilities retain the desktop defaults. Web builds can expose
  // browser fullscreen without pretending they can resize an OS window.
  fullscreenControlsEnabled?: boolean;
  windowSizeControlsEnabled?: boolean;
  // Web stores an explicit language preference per game/default-language
  // scope. Desktop settings remain one application-wide document.
  gameScopedLanguagePreferences?: boolean;
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
  fullscreenControlsEnabled: true,
  windowSizeControlsEnabled: true,
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
