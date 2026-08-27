/**
 * 主要作用：定义 Main、Preload、Renderer 共享的 IPC、设置、存档与资源协议。
 * 关键函数与实现：createDefaultPlayerSettings、isPlayerSettings、createPlayerSaveSummaryContent；以 TypeScript 类型边界和可组合函数实现。
 */
import type {
  GameRuntime,
  GameRuntimeSnapshot,
  ProjectDocument,
} from '@vnengine/runtime';

export const PLAYER_IPC_CHANNEL = 'vn-player:request';

export const LEGACY_PLAYER_SETTINGS_VERSION = 1 as const;
export const PLAYER_SETTINGS_VERSION = 2 as const;

export type PlayerLanguage = 'zh-CN' | 'en-US';
export type PlayerWindowMode = 'windowed' | 'fullscreen';
export type PlayerWindowSizePreset = 'small' | 'medium' | 'large';

export type PlayerSettingsV1 = {
  readonly settingsVersion: typeof LEGACY_PLAYER_SETTINGS_VERSION;
  readonly masterVolume: number;
  readonly bgmVolume: number;
  readonly voiceVolume: number;
  readonly videoVolume: number;
  readonly windowMode: PlayerWindowMode;
  readonly windowSizePreset: PlayerWindowSizePreset;
};

export type PlayerSettingsV2 = {
  readonly settingsVersion: typeof PLAYER_SETTINGS_VERSION;
  readonly language: PlayerLanguage;
  readonly masterVolume: number;
  readonly bgmVolume: number;
  readonly voiceVolume: number;
  readonly videoVolume: number;
  readonly windowMode: PlayerWindowMode;
  readonly windowSizePreset: PlayerWindowSizePreset;
};

export type PlayerSettings = PlayerSettingsV2;

type PlayerSettingsMutableFields = {
  -readonly [Field in keyof Omit<PlayerSettings, 'settingsVersion'>]:
    PlayerSettings[Field];
};

export type PlayerSettingsPatch = {
  [Field in keyof PlayerSettingsMutableFields]:
    Pick<PlayerSettingsMutableFields, Field> &
      Partial<Omit<PlayerSettingsMutableFields, Field>>;
}[keyof PlayerSettingsMutableFields];

export const DEFAULT_PLAYER_SETTINGS: Readonly<PlayerSettings> = Object.freeze({
  settingsVersion: PLAYER_SETTINGS_VERSION,
  language: 'zh-CN',
  masterVolume: 1,
  bgmVolume: 1,
  voiceVolume: 1,
  videoVolume: 1,
  windowMode: 'windowed',
  windowSizePreset: 'medium',
});

export function createDefaultPlayerSettings(): PlayerSettings {
  return { ...DEFAULT_PLAYER_SETTINGS };
}

function isSettingsObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactSettingsFields(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((field, index) => field === wanted[index]);
}

function isVolume(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
}

export function isPlayerSettingsV1(value: unknown): value is PlayerSettingsV1 {
  return isSettingsObject(value) &&
    hasExactSettingsFields(value, [
      'settingsVersion',
      'masterVolume',
      'bgmVolume',
      'voiceVolume',
      'videoVolume',
      'windowMode',
      'windowSizePreset',
    ]) &&
    value.settingsVersion === LEGACY_PLAYER_SETTINGS_VERSION &&
    isVolume(value.masterVolume) &&
    isVolume(value.bgmVolume) &&
    isVolume(value.voiceVolume) &&
    isVolume(value.videoVolume) &&
    (value.windowMode === 'windowed' || value.windowMode === 'fullscreen') &&
    (value.windowSizePreset === 'small' ||
      value.windowSizePreset === 'medium' ||
      value.windowSizePreset === 'large');
}

export function isPlayerSettingsV2(value: unknown): value is PlayerSettingsV2 {
  return isSettingsObject(value) &&
    hasExactSettingsFields(value, [
      'settingsVersion',
      'language',
      'masterVolume',
      'bgmVolume',
      'voiceVolume',
      'videoVolume',
      'windowMode',
      'windowSizePreset',
    ]) &&
    value.settingsVersion === PLAYER_SETTINGS_VERSION &&
    (value.language === 'zh-CN' || value.language === 'en-US') &&
    isVolume(value.masterVolume) &&
    isVolume(value.bgmVolume) &&
    isVolume(value.voiceVolume) &&
    isVolume(value.videoVolume) &&
    (value.windowMode === 'windowed' || value.windowMode === 'fullscreen') &&
    (value.windowSizePreset === 'small' ||
      value.windowSizePreset === 'medium' ||
      value.windowSizePreset === 'large');
}

export const isPlayerSettings = isPlayerSettingsV2;

export function isPlayerSettingsPatch(value: unknown): value is PlayerSettingsPatch {
  if (!isSettingsObject(value)) {
    return false;
  }
  const allowed = new Set([
    'language',
    'masterVolume',
    'bgmVolume',
    'voiceVolume',
    'videoVolume',
    'windowMode',
    'windowSizePreset',
  ]);
  const fields = Object.keys(value);
  if (
    fields.length === 0 ||
    fields.some((field) => !allowed.has(field))
  ) {
    return false;
  }
  return isPlayerSettings({
    ...createDefaultPlayerSettings(),
    ...value,
  });
}

export type PlayerAssetType = 'image' | 'audio' | 'video';

// Generic Player can open external bundles. An embedded Player is a read-only
// single-game application and must never expose a replacement-bundle picker.
export type PlayerMode = 'generic' | 'embedded';

export const PLAYER_ERROR_CODES = [
  'bundle-load-failed',
  'bundle-selection-failed',
  'embedded-open-disabled',
  'no-active-game',
  'save-storage-unavailable',
  'runtime-not-saveable',
  'save-incompatible',
  'game-session-stale',
  'settings-storage-unavailable',
  'settings-invalid',
  'web-open-disabled',
  'web-game-not-loaded',
  'fullscreen-denied',
] as const;

export type PlayerErrorCode = typeof PLAYER_ERROR_CODES[number];

// This is the only Asset shape that may cross into Renderer. Storage paths,
// hashes, file sizes and capability tokens remain private to Electron Main.
export type PlayerAsset = {
  id: string;
  type: PlayerAssetType;
  displayName: string;
};

export type PlayerGameData = {
  project: ProjectDocument;
  assets: PlayerAsset[];
};

export type PlayerLoadResult =
  | {
      status: 'loaded';
      mode: PlayerMode;
      game: PlayerGameData;
    }
  | {
      status: 'empty';
      mode: PlayerMode;
    }
  | {
      status: 'error';
      mode: PlayerMode;
      error: PlayerErrorCode;
    };

export type PlayerOpenResult =
  | {
      status: 'opened';
      game: PlayerGameData;
    }
  | {
      status: 'canceled';
    }
  | {
      status: 'rejected';
      error: PlayerErrorCode;
    };

export type PlayerManualSaveSlotId = 1 | 2 | 3;
export type PlayerSaveSlotId = PlayerManualSaveSlotId | 'quick';

export type PlayerSaveSummaryContent =
  | { kind: 'dialogue'; speaker: string; text: string }
  | { kind: 'progress' }
  | { kind: 'choosing' }
  | { kind: 'playing-video' }
  | { kind: 'finished' };

export function createPlayerSaveSummaryContent(
  runtime: Pick<GameRuntime, 'dialogue' | 'status'>,
): PlayerSaveSummaryContent {
  if (runtime.dialogue !== null) {
    return {
      kind: 'dialogue',
      speaker: runtime.dialogue.speaker,
      text: runtime.dialogue.text,
    };
  }
  if (runtime.status === 'choosing') {
    return { kind: 'choosing' };
  }
  if (runtime.status === 'playingVideo') {
    return { kind: 'playing-video' };
  }
  if (runtime.status === 'finished') {
    return { kind: 'finished' };
  }
  return { kind: 'progress' };
}

export type PlayerSaveSummary = {
  slotId: PlayerSaveSlotId;
  savedAt: string;
  sceneName: string;
  summary: PlayerSaveSummaryContent;
};

export type PlayerSaveListResult =
  | { status: 'ready'; slots: PlayerSaveSummary[] }
  | { status: 'rejected'; error: PlayerErrorCode };

export type PlayerSaveWriteResult =
  | { status: 'saved'; slot: PlayerSaveSummary }
  | { status: 'rejected'; error: PlayerErrorCode };

export type PlayerSaveLoadResult =
  | { status: 'loaded'; runtime: GameRuntime }
  | { status: 'empty' }
  | { status: 'rejected'; error: PlayerErrorCode };

export type PlayerSettingsReadResult =
  | { status: 'ready'; settings: PlayerSettings }
  | { status: 'rejected'; error: PlayerErrorCode };

export type PlayerSettingsWriteResult =
  | { status: 'updated'; settings: PlayerSettings }
  | { status: 'rejected'; error: PlayerErrorCode };

export type PlayerInvocation =
  | {
      action: 'load-game';
      params: Record<string, never>;
    }
  | {
      action: 'open-game';
      params: Record<string, never>;
    }
  | {
      action: 'quit-game';
      params: Record<string, never>;
    }
  | {
      action: 'get-media-url';
      params: {
        assetId: string;
      };
    }
  | {
      action: 'list-save-slots';
      params: Record<string, never>;
    }
  | {
      action: 'save-game';
      params: {
        slotId: PlayerManualSaveSlotId;
        snapshot: GameRuntimeSnapshot;
      };
    }
  | {
      action: 'load-game-slot';
      params: { slotId: PlayerManualSaveSlotId };
    }
  | {
      action: 'quick-save';
      params: { snapshot: GameRuntimeSnapshot };
    }
  | {
      action: 'quick-load';
      params: Record<string, never>;
    }
  | {
      action: 'get-settings';
      params: Record<string, never>;
    }
  | {
      action: 'update-settings';
      params: { patch: PlayerSettingsPatch };
    };

export type VnPlayerApi = {
  loadGame(): Promise<PlayerLoadResult>;
  openGame(): Promise<PlayerOpenResult>;
  getMediaUrl(assetId: string): Promise<string | null>;
  listSaveSlots(): Promise<PlayerSaveListResult>;
  saveGame(
    slotId: PlayerManualSaveSlotId,
    snapshot: GameRuntimeSnapshot,
  ): Promise<PlayerSaveWriteResult>;
  loadGameSlot(
    slotId: PlayerManualSaveSlotId,
  ): Promise<PlayerSaveLoadResult>;
  quickSave(snapshot: GameRuntimeSnapshot): Promise<PlayerSaveWriteResult>;
  quickLoad(): Promise<PlayerSaveLoadResult>;
  getSettings(): Promise<PlayerSettingsReadResult>;
  updateSettings(
    patch: PlayerSettingsPatch,
  ): Promise<PlayerSettingsWriteResult>;
  quitGame(): Promise<void>;
};
