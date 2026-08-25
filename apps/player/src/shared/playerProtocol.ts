import type {
  GameRuntime,
  GameRuntimeSnapshot,
  ProjectDocument,
} from '@vnengine/runtime';

export const PLAYER_IPC_CHANNEL = 'vn-player:request';

export const PLAYER_SETTINGS_VERSION = 1 as const;

export type PlayerWindowMode = 'windowed' | 'fullscreen';
export type PlayerWindowSizePreset = 'small' | 'medium' | 'large';

export type PlayerSettingsV1 = {
  readonly settingsVersion: typeof PLAYER_SETTINGS_VERSION;
  readonly masterVolume: number;
  readonly bgmVolume: number;
  readonly voiceVolume: number;
  readonly videoVolume: number;
  readonly windowMode: PlayerWindowMode;
  readonly windowSizePreset: PlayerWindowSizePreset;
};

type PlayerSettingsMutableFields = {
  -readonly [Field in keyof Omit<PlayerSettingsV1, 'settingsVersion'>]:
    PlayerSettingsV1[Field];
};

export type PlayerSettingsPatch = {
  [Field in keyof PlayerSettingsMutableFields]:
    Pick<PlayerSettingsMutableFields, Field> &
      Partial<Omit<PlayerSettingsMutableFields, Field>>;
}[keyof PlayerSettingsMutableFields];

export const DEFAULT_PLAYER_SETTINGS: Readonly<PlayerSettingsV1> = Object.freeze({
  settingsVersion: PLAYER_SETTINGS_VERSION,
  masterVolume: 1,
  bgmVolume: 1,
  voiceVolume: 1,
  videoVolume: 1,
  windowMode: 'windowed',
  windowSizePreset: 'medium',
});

export function createDefaultPlayerSettings(): PlayerSettingsV1 {
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
    value.settingsVersion === PLAYER_SETTINGS_VERSION &&
    isVolume(value.masterVolume) &&
    isVolume(value.bgmVolume) &&
    isVolume(value.voiceVolume) &&
    isVolume(value.videoVolume) &&
    (value.windowMode === 'windowed' || value.windowMode === 'fullscreen') &&
    (value.windowSizePreset === 'small' ||
      value.windowSizePreset === 'medium' ||
      value.windowSizePreset === 'large');
}

export function isPlayerSettingsPatch(value: unknown): value is PlayerSettingsPatch {
  if (!isSettingsObject(value)) {
    return false;
  }
  const allowed = new Set([
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
  return isPlayerSettingsV1({
    ...createDefaultPlayerSettings(),
    ...value,
  });
}

export type PlayerAssetType = 'image' | 'audio' | 'video';

// Generic Player can open external bundles. An embedded Player is a read-only
// single-game application and must never expose a replacement-bundle picker.
export type PlayerMode = 'generic' | 'embedded';

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
      error: string;
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
      error: string;
    };

export type PlayerManualSaveSlotId = 1 | 2 | 3;
export type PlayerSaveSlotId = PlayerManualSaveSlotId | 'quick';

export type PlayerSaveSummary = {
  slotId: PlayerSaveSlotId;
  savedAt: string;
  sceneName: string;
  summary: string;
};

export type PlayerSaveListResult =
  | { status: 'ready'; slots: PlayerSaveSummary[] }
  | { status: 'rejected'; error: string };

export type PlayerSaveWriteResult =
  | { status: 'saved'; slot: PlayerSaveSummary }
  | { status: 'rejected'; error: string };

export type PlayerSaveLoadResult =
  | { status: 'loaded'; runtime: GameRuntime }
  | { status: 'empty' }
  | { status: 'rejected'; error: string };

export type PlayerSettingsReadResult =
  | { status: 'ready'; settings: PlayerSettingsV1 }
  | { status: 'rejected'; error: string };

export type PlayerSettingsWriteResult =
  | { status: 'updated'; settings: PlayerSettingsV1 }
  | { status: 'rejected'; error: string };

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
