/**
 * 主要作用：使用 IndexedDB 持久化 Web Player 的设置与版本化存档。
 * 关键函数与实现：`WebDocumentStore`、`IndexedDbDocumentStore`、`WebStorageGame`、`WebPlayerStoragePort`；基于浏览器 Fetch、IndexedDB、Fullscreen 与 React 边界实现。
 */
import {
  areGameRuntimeSnapshotsEqual,
  createGameRuntimeSnapshot,
  restoreGameRuntimeSnapshot,
  type GameRuntime,
  type GameRuntimeSnapshot,
} from '@vnengine/runtime';

import type { PlayerGameView } from '../renderer/playerGateway';
import {
  createPlayerSaveSummaryContent,
  createDefaultPlayerSettings,
  isPlayerSettings,
  isPlayerSettingsV1,
  LEGACY_PLAYER_SETTINGS_VERSION,
  PLAYER_SETTINGS_VERSION,
  type PlayerSaveListResult,
  type PlayerSaveLoadResult,
  type PlayerSaveSlotId,
  type PlayerSaveSummary,
  type PlayerSaveWriteResult,
  type PlayerErrorCode,
  type PlayerLanguage,
  type PlayerSettingsReadResult,
  type PlayerSettings,
  type PlayerSettingsWriteResult,
} from '../shared/playerProtocol';
import type { WebBundleIdentity } from './WebBundleLoader';

const DATABASE_NAME = 'vn-engine-web-player-v1';
const DATABASE_VERSION = 1;
const DOCUMENT_STORE = 'documents';
const SAVE_FORMAT = 'vn-engine-player-save';
const SAVE_VERSION = 1;
const SETTINGS_FORMAT = 'vn-engine-player-settings';
const LEGACY_SETTINGS_KEY = 'settings-v1';
const SETTINGS_KEY = 'settings-v2';
const LANGUAGE_OVERRIDE_FORMAT = 'vn-engine-web-player-language';
const LANGUAGE_OVERRIDE_VERSION = 1;
const LANGUAGE_OVERRIDE_KEY_PREFIX = 'language-v1';
const MAX_SAVE_BYTES = 256 * 1024;
const SAVE_SLOTS: readonly PlayerSaveSlotId[] = [1, 2, 3, 'quick'];
const SAVE_STORAGE_ERROR: PlayerErrorCode = 'save-storage-unavailable';
const RUNTIME_NOT_SAVEABLE_ERROR: PlayerErrorCode = 'runtime-not-saveable';
const SAVE_INCOMPATIBLE_ERROR: PlayerErrorCode = 'save-incompatible';
const SETTINGS_STORAGE_ERROR: PlayerErrorCode = 'settings-storage-unavailable';
const SETTINGS_INVALID_ERROR: PlayerErrorCode = 'settings-invalid';

type StoredRecord = {
  key: string;
  value: unknown;
};

export type WebDocumentStore = {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, value: unknown): Promise<void>;
  putMany(records: readonly StoredRecord[]): Promise<void>;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionFinished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error ?? new Error('IndexedDB transaction was aborted'),
    );
    transaction.onerror = () => reject(
      transaction.error ?? new Error('IndexedDB transaction failed'),
    );
  });
}

export class IndexedDbDocumentStore implements WebDocumentStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
    private readonly databaseName = DATABASE_NAME,
  ) {}

  async get(key: string): Promise<unknown | undefined> {
    const database = await this.database();
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly');
    const record = await requestResult(
      transaction.objectStore(DOCUMENT_STORE).get(key) as IDBRequest<
        StoredRecord | undefined
      >,
    );
    return record?.value;
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.putMany([{ key, value }]);
  }

  async putMany(records: readonly StoredRecord[]): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
    const finished = transactionFinished(transaction);
    const store = transaction.objectStore(DOCUMENT_STORE);
    await Promise.all([
      ...records.map((record) => requestResult(store.put(record))),
      finished,
    ]);
  }

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise !== null) {
      return this.databasePromise;
    }
    if (this.factory === undefined) {
      return Promise.reject(new Error('IndexedDB is unavailable'));
    }
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.factory!.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
          database.createObjectStore(DOCUMENT_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        this.databasePromise = null;
        reject(request.error ?? new Error('IndexedDB open failed'));
      };
      request.onblocked = () => {
        this.databasePromise = null;
        reject(new Error('IndexedDB upgrade was blocked'));
      };
    });
    return this.databasePromise;
  }
}

export type WebStorageGame = {
  game: PlayerGameView;
  identity: WebBundleIdentity;
};

export type WebPlayerStoragePort = {
  listSaveSlots(active: WebStorageGame): Promise<PlayerSaveListResult>;
  writeSave(
    active: WebStorageGame,
    slotId: PlayerSaveSlotId,
    snapshot: GameRuntimeSnapshot,
  ): Promise<PlayerSaveWriteResult>;
  loadSave(
    active: WebStorageGame,
    slotId: PlayerSaveSlotId,
  ): Promise<PlayerSaveLoadResult>;
  readSettings(active: WebStorageGame): Promise<PlayerSettingsReadResult>;
  writeSettings(
    active: WebStorageGame,
    settings: PlayerSettings,
    persistLanguage: boolean,
  ): Promise<PlayerSettingsWriteResult>;
};

type SaveDocument = {
  format: typeof SAVE_FORMAT;
  saveVersion: typeof SAVE_VERSION;
  game: WebBundleIdentity;
  slotId: PlayerSaveSlotId;
  savedAt: string;
  snapshot: GameRuntimeSnapshot;
};

type SettingsDocument = {
  format: typeof SETTINGS_FORMAT;
  settingsVersion: typeof PLAYER_SETTINGS_VERSION;
  settings: Omit<PlayerSettings, 'settingsVersion'>;
};

type LanguageOverrideDocument = {
  format: typeof LANGUAGE_OVERRIDE_FORMAT;
  languageVersion: typeof LANGUAGE_OVERRIDE_VERSION;
  projectId: string;
  defaultLanguage: PlayerLanguage;
  language: PlayerLanguage;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((field, index) => field === wanted[index]);
}

function sameSnapshot(left: GameRuntimeSnapshot, right: unknown): boolean {
  return isObject(right) && (
    right.snapshotVersion === 1 ||
    right.snapshotVersion === 2 ||
    right.snapshotVersion === 3 ||
    right.snapshotVersion === 4 ||
    areGameRuntimeSnapshotsEqual(left, right)
  );
}

function isCanonicalDate(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function sameIdentity(left: WebBundleIdentity, right: unknown): boolean {
  return isObject(right) &&
    hasExactFields(right, [
      'projectId',
      'runtimeVersion',
      'contentFingerprint',
    ]) &&
    right.projectId === left.projectId &&
    right.runtimeVersion === left.runtimeVersion &&
    right.contentFingerprint === left.contentFingerprint;
}

function validateRuntimeAssets(game: PlayerGameView, runtime: GameRuntime): void {
  const assets = new Map(game.assets.map((asset) => [asset.id, asset.type]));
  const requireType = (
    assetId: string | null,
    type: 'image' | 'audio' | 'video',
  ): void => {
    if (assetId !== null && assets.get(assetId) !== type) {
      throw new Error('runtime references an invalid asset');
    }
  };
  requireType(runtime.backgroundAssetId, 'image');
  requireType(runtime.bgmAssetId, 'audio');
  requireType(runtime.videoAssetId, 'video');
  requireType(runtime.cgAssetId, 'image');
  requireType(runtime.dialogue?.voiceAssetId ?? null, 'audio');
  for (const character of runtime.characters) {
    requireType(character.assetId, 'image');
  }
}

function parseSave(
  value: unknown,
  slotId: PlayerSaveSlotId,
  active: WebStorageGame,
): { document: SaveDocument; runtime: GameRuntime } {
  if (
    !isObject(value) ||
    !hasExactFields(value, [
      'format',
      'saveVersion',
      'game',
      'slotId',
      'savedAt',
      'snapshot',
    ]) ||
    value.format !== SAVE_FORMAT ||
    value.saveVersion !== SAVE_VERSION ||
    value.slotId !== slotId ||
    !isCanonicalDate(value.savedAt) ||
    !sameIdentity(active.identity, value.game)
  ) {
    throw new Error('invalid save document');
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SAVE_BYTES) {
    throw new Error('oversized save document');
  }
  const runtime = restoreGameRuntimeSnapshot(active.game.project, value.snapshot);
  if (runtime === null) {
    throw new Error('invalid runtime snapshot');
  }
  const canonical = createGameRuntimeSnapshot(active.game.project, runtime);
  if (canonical === null || !sameSnapshot(canonical, value.snapshot)) {
    throw new Error('non-canonical runtime snapshot');
  }
  validateRuntimeAssets(active.game, runtime);
  return { document: value as SaveDocument, runtime };
}

function summarize(
  slotId: PlayerSaveSlotId,
  savedAt: string,
  active: WebStorageGame,
  runtime: GameRuntime,
): PlayerSaveSummary {
  const sceneName = active.game.project.scenes.find(
    (scene) => scene.id === runtime.sceneId,
  )?.name ?? runtime.sceneId;
  return {
    slotId,
    savedAt,
    sceneName,
    summary: createPlayerSaveSummaryContent(runtime),
  };
}

function settingsDocument(settings: PlayerSettings): SettingsDocument {
  return {
    format: SETTINGS_FORMAT,
    settingsVersion: PLAYER_SETTINGS_VERSION,
    settings: {
      language: settings.language,
      masterVolume: settings.masterVolume,
      bgmVolume: settings.bgmVolume,
      voiceVolume: settings.voiceVolume,
      videoVolume: settings.videoVolume,
      windowMode: settings.windowMode,
      windowSizePreset: settings.windowSizePreset,
    },
  };
}

function parseSettings(
  value: unknown,
  expectedVersion:
    | typeof LEGACY_PLAYER_SETTINGS_VERSION
    | typeof PLAYER_SETTINGS_VERSION,
): PlayerSettings {
  if (
    !isObject(value) ||
    !hasExactFields(value, ['format', 'settingsVersion', 'settings']) ||
    value.format !== SETTINGS_FORMAT ||
    value.settingsVersion !== expectedVersion ||
    !isObject(value.settings)
  ) {
    throw new Error('invalid settings document');
  }
  const v1Fields = [
    'masterVolume',
    'bgmVolume',
    'voiceVolume',
    'videoVolume',
    'windowMode',
    'windowSizePreset',
  ] as const;
  if (expectedVersion === LEGACY_PLAYER_SETTINGS_VERSION) {
    if (!hasExactFields(value.settings, v1Fields)) {
      throw new Error('invalid settings document');
    }
    const legacy: unknown = {
      settingsVersion: LEGACY_PLAYER_SETTINGS_VERSION,
      ...value.settings,
    };
    if (!isPlayerSettingsV1(legacy)) {
      throw new Error('invalid settings values');
    }
    return {
      ...legacy,
      settingsVersion: PLAYER_SETTINGS_VERSION,
      language: 'zh-CN',
    };
  }
  if (
    !hasExactFields(value.settings, ['language', ...v1Fields])
  ) {
    throw new Error('invalid settings document');
  }
  const settings: unknown = {
    settingsVersion: PLAYER_SETTINGS_VERSION,
    ...value.settings,
  };
  if (!isPlayerSettings(settings)) {
    throw new Error('invalid settings values');
  }
  return settings;
}

function languageOverrideKey(active: WebStorageGame): string {
  return [
    LANGUAGE_OVERRIDE_KEY_PREFIX,
    active.identity.projectId,
    active.game.defaultLanguage,
  ].join('\0');
}

function languageOverrideDocument(
  active: WebStorageGame,
  language: PlayerLanguage,
): LanguageOverrideDocument {
  return {
    format: LANGUAGE_OVERRIDE_FORMAT,
    languageVersion: LANGUAGE_OVERRIDE_VERSION,
    projectId: active.identity.projectId,
    defaultLanguage: active.game.defaultLanguage,
    language,
  };
}

function parseLanguageOverride(
  value: unknown,
  active: WebStorageGame,
): PlayerLanguage {
  if (
    !isObject(value) ||
    !hasExactFields(value, [
      'format',
      'languageVersion',
      'projectId',
      'defaultLanguage',
      'language',
    ]) ||
    value.format !== LANGUAGE_OVERRIDE_FORMAT ||
    value.languageVersion !== LANGUAGE_OVERRIDE_VERSION ||
    value.projectId !== active.identity.projectId ||
    value.defaultLanguage !== active.game.defaultLanguage ||
    (value.language !== 'zh-CN' && value.language !== 'en-US')
  ) {
    throw new Error('invalid language override');
  }
  return value.language;
}

function saveKey(identity: WebBundleIdentity, slotId: PlayerSaveSlotId): string {
  return [
    'save-v1',
    identity.projectId,
    String(identity.runtimeVersion),
    identity.contentFingerprint,
    String(slotId),
  ].join('\0');
}

export class WebPlayerStorage implements WebPlayerStoragePort {
  constructor(
    private readonly documents: WebDocumentStore = new IndexedDbDocumentStore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listSaveSlots(active: WebStorageGame): Promise<PlayerSaveListResult> {
    try {
      const slots: PlayerSaveSummary[] = [];
      for (const slotId of SAVE_SLOTS) {
        const value = await this.documents.get(saveKey(active.identity, slotId));
        if (value === undefined) {
          continue;
        }
        try {
          const loaded = parseSave(value, slotId, active);
          slots.push(summarize(
            slotId,
            loaded.document.savedAt,
            active,
            loaded.runtime,
          ));
        } catch {
          // A malformed slot is isolated so the remaining saves stay usable.
        }
      }
      return { status: 'ready', slots };
    } catch {
      return { status: 'rejected', error: SAVE_STORAGE_ERROR };
    }
  }

  async writeSave(
    active: WebStorageGame,
    slotId: PlayerSaveSlotId,
    snapshot: GameRuntimeSnapshot,
  ): Promise<PlayerSaveWriteResult> {
    try {
      const runtime = restoreGameRuntimeSnapshot(active.game.project, snapshot);
      if (runtime === null) {
        return { status: 'rejected', error: RUNTIME_NOT_SAVEABLE_ERROR };
      }
      const canonical = createGameRuntimeSnapshot(active.game.project, runtime);
      if (canonical === null || !sameSnapshot(canonical, snapshot)) {
        return { status: 'rejected', error: RUNTIME_NOT_SAVEABLE_ERROR };
      }
      try {
        validateRuntimeAssets(active.game, runtime);
      } catch {
        return { status: 'rejected', error: RUNTIME_NOT_SAVEABLE_ERROR };
      }
      const savedAt = this.now().toISOString();
      const document: SaveDocument = {
        format: SAVE_FORMAT,
        saveVersion: SAVE_VERSION,
        game: active.identity,
        slotId,
        savedAt,
        snapshot: canonical,
      };
      if (
        new TextEncoder().encode(JSON.stringify(document)).byteLength >
          MAX_SAVE_BYTES
      ) {
        return { status: 'rejected', error: RUNTIME_NOT_SAVEABLE_ERROR };
      }
      await this.documents.put(saveKey(active.identity, slotId), document);
      return {
        status: 'saved',
        slot: summarize(slotId, savedAt, active, runtime),
      };
    } catch {
      return { status: 'rejected', error: SAVE_STORAGE_ERROR };
    }
  }

  async loadSave(
    active: WebStorageGame,
    slotId: PlayerSaveSlotId,
  ): Promise<PlayerSaveLoadResult> {
    let value: unknown | undefined;
    try {
      value = await this.documents.get(saveKey(active.identity, slotId));
    } catch {
      return { status: 'rejected', error: SAVE_STORAGE_ERROR };
    }
    if (value === undefined) {
      return { status: 'empty' };
    }
    try {
      return { status: 'loaded', runtime: parseSave(value, slotId, active).runtime };
    } catch {
      return {
        status: 'rejected',
        error: SAVE_INCOMPATIBLE_ERROR,
      };
    }
  }

  async readSettings(
    active: WebStorageGame,
  ): Promise<PlayerSettingsReadResult> {
    let value: unknown | undefined;
    let languageOverride: unknown | undefined;
    let version:
      | typeof LEGACY_PLAYER_SETTINGS_VERSION
      | typeof PLAYER_SETTINGS_VERSION = PLAYER_SETTINGS_VERSION;
    try {
      value = await this.documents.get(SETTINGS_KEY);
      if (value === undefined) {
        value = await this.documents.get(LEGACY_SETTINGS_KEY);
        version = LEGACY_PLAYER_SETTINGS_VERSION;
      }
      languageOverride = await this.documents.get(languageOverrideKey(active));
    } catch {
      return { status: 'rejected', error: SETTINGS_STORAGE_ERROR };
    }
    let settings = createDefaultPlayerSettings();
    try {
      if (value !== undefined) {
        settings = parseSettings(value, version);
      }
    } catch {
      // Corrupt values must not permanently lock the options screen. Return a
      // clean value that the next successful write can replace.
      settings = createDefaultPlayerSettings();
    }
    let language = active.game.defaultLanguage;
    let languageSource: 'default' | 'stored' = 'default';
    if (languageOverride !== undefined) {
      try {
        language = parseLanguageOverride(languageOverride, active);
        languageSource = 'stored';
      } catch {
        // A malformed or mismatched per-game preference must never override
        // the default language authored into this exact Web export.
      }
    }
    return {
      status: 'ready',
      settings: { ...settings, language },
      languageSource,
    };
  }

  async writeSettings(
    active: WebStorageGame,
    settings: PlayerSettings,
    persistLanguage: boolean,
  ): Promise<PlayerSettingsWriteResult> {
    if (!isPlayerSettings(settings)) {
      return { status: 'rejected', error: SETTINGS_INVALID_ERROR };
    }
    try {
      const canonical = {
        ...settings,
        masterVolume: Object.is(settings.masterVolume, -0)
          ? 0
          : settings.masterVolume,
        bgmVolume: Object.is(settings.bgmVolume, -0) ? 0 : settings.bgmVolume,
        voiceVolume: Object.is(settings.voiceVolume, -0)
          ? 0
          : settings.voiceVolume,
        videoVolume: Object.is(settings.videoVolume, -0)
          ? 0
          : settings.videoVolume,
      };
      const records: StoredRecord[] = [{
        key: SETTINGS_KEY,
        value: settingsDocument(canonical),
      }];
      if (persistLanguage) {
        records.push({
          key: languageOverrideKey(active),
          value: languageOverrideDocument(active, canonical.language),
        });
      }
      await this.documents.putMany(records);
      return { status: 'updated', settings: canonical };
    } catch {
      return { status: 'rejected', error: SETTINGS_STORAGE_ERROR };
    }
  }
}
