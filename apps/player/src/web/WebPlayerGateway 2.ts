import type { GameRuntimeSnapshot } from '@vnengine/runtime';

import type {
  PlayerGateway,
  PlayerLoadViewResult,
} from '../renderer/playerGateway';
import {
  isPlayerSettingsPatch,
  type PlayerManualSaveSlotId,
  type PlayerOpenResult,
  type PlayerSaveListResult,
  type PlayerSaveLoadResult,
  type PlayerSaveWriteResult,
  type PlayerSettingsPatch,
  type PlayerSettingsReadResult,
  type PlayerSettings,
  type PlayerSettingsWriteResult,
} from '../shared/playerProtocol';
import {
  loadWebBundle,
  type LoadedWebBundle,
} from './WebBundleLoader';
import {
  WebPlayerStorage,
  type WebPlayerStoragePort,
  type WebStorageGame,
} from './WebStorage';

export type WebPlayerGatewayOptions = {
  loadBundle?: () => Promise<LoadedWebBundle>;
  storage?: WebPlayerStoragePort;
  reload?: () => void;
  fullscreenDocument?: Document | null;
};

export class WebPlayerGateway implements PlayerGateway {
  readonly fullscreenControlsEnabled: boolean;
  readonly windowSizeControlsEnabled = false;

  private readonly loadBundle: () => Promise<LoadedWebBundle>;
  private readonly storage: WebPlayerStoragePort;
  private readonly reloadPage: () => void;
  private readonly fullscreenDocument: Document | null;
  private active: LoadedWebBundle | null = null;
  private activation: Promise<LoadedWebBundle> | null = null;
  private settingsQueue: Promise<void> = Promise.resolve();
  private settingsCache: PlayerSettings | null = null;

  private readonly handleFullscreenChange = (): void => {
    void this.persistAuthoritativeFullscreenMode();
  };

  constructor(options: WebPlayerGatewayOptions = {}) {
    this.loadBundle = options.loadBundle ?? (() => loadWebBundle());
    this.storage = options.storage ?? new WebPlayerStorage();
    this.reloadPage = options.reload ?? (() => {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    });
    this.fullscreenDocument = options.fullscreenDocument === undefined
      ? typeof document === 'undefined' ? null : document
      : options.fullscreenDocument;
    this.fullscreenControlsEnabled = this.fullscreenDocument !== null &&
      typeof this.fullscreenDocument.documentElement.requestFullscreen ===
        'function' &&
      typeof this.fullscreenDocument.exitFullscreen === 'function';
    this.fullscreenDocument?.addEventListener(
      'fullscreenchange',
      this.handleFullscreenChange,
    );
  }

  async loadGame(): Promise<PlayerLoadViewResult> {
    try {
      const bundle = await this.requireBundle();
      return { status: 'loaded', mode: 'embedded', game: bundle.game };
    } catch {
      return { status: 'error', mode: 'embedded', error: 'bundle-load-failed' };
    }
  }

  async openGame(): Promise<PlayerOpenResult> {
    return {
      status: 'rejected',
      error: 'web-open-disabled',
    };
  }

  async listSaveSlots(): Promise<PlayerSaveListResult> {
    const active = await this.activeStorageGame();
    return active === null
      ? { status: 'rejected', error: 'web-game-not-loaded' }
      : this.storage.listSaveSlots(active);
  }

  async saveGame(
    slotId: PlayerManualSaveSlotId,
    snapshot: GameRuntimeSnapshot,
  ): Promise<PlayerSaveWriteResult> {
    const active = await this.activeStorageGame();
    return active === null
      ? { status: 'rejected', error: 'web-game-not-loaded' }
      : this.storage.writeSave(active, slotId, snapshot);
  }

  async loadGameSlot(
    slotId: PlayerManualSaveSlotId,
  ): Promise<PlayerSaveLoadResult> {
    const active = await this.activeStorageGame();
    return active === null
      ? { status: 'rejected', error: 'web-game-not-loaded' }
      : this.storage.loadSave(active, slotId);
  }

  async quickSave(
    snapshot: GameRuntimeSnapshot,
  ): Promise<PlayerSaveWriteResult> {
    const active = await this.activeStorageGame();
    return active === null
      ? { status: 'rejected', error: 'web-game-not-loaded' }
      : this.storage.writeSave(active, 'quick', snapshot);
  }

  async quickLoad(): Promise<PlayerSaveLoadResult> {
    const active = await this.activeStorageGame();
    return active === null
      ? { status: 'rejected', error: 'web-game-not-loaded' }
      : this.storage.loadSave(active, 'quick');
  }

  getSettings(): Promise<PlayerSettingsReadResult> {
    return this.runSettingsExclusive(async () => {
      const result = await this.storage.readSettings();
      if (result.status === 'rejected') {
        return result;
      }
      const settings = this.withAuthoritativeFullscreenMode(result.settings);
      this.settingsCache = settings;
      if (settings.windowMode !== result.settings.windowMode) {
        await this.storage.writeSettings(settings);
      }
      return { status: 'ready', settings };
    });
  }

  updateSettings(
    patch: PlayerSettingsPatch,
  ): Promise<PlayerSettingsWriteResult> {
    if (!isPlayerSettingsPatch(patch)) {
      return Promise.resolve({ status: 'rejected', error: 'settings-invalid' });
    }
    // Invoke the browser API synchronously from the select's change handler;
    // deferring this until after an IndexedDB read would lose user activation.
    const fullscreenRequest = patch.windowMode !== undefined
      ? this.applyFullscreenMode(patch.windowMode)
      : Promise.resolve();
    return this.runSettingsExclusive(async () => {
      try {
        await fullscreenRequest;
      } catch {
        return {
          status: 'rejected',
          error: 'fullscreen-denied',
        };
      }
      let current = this.settingsCache;
      if (current === null) {
        const loaded = await this.storage.readSettings();
        if (loaded.status === 'rejected') {
          return loaded;
        }
        current = loaded.settings;
      }
      const next = this.withAuthoritativeFullscreenMode({
        ...current,
        ...patch,
      });
      const result = await this.storage.writeSettings(next);
      if (result.status === 'updated') {
        this.settingsCache = result.settings;
      }
      return result;
    });
  }

  readonly resolveMediaUrl = async (assetId: string): Promise<string | null> => {
    const bundle = await this.requireBundle().catch(() => null);
    return bundle?.assetUrls.get(assetId) ?? null;
  };

  async quit(): Promise<void> {
    this.reloadPage();
  }

  dispose(): void {
    this.fullscreenDocument?.removeEventListener(
      'fullscreenchange',
      this.handleFullscreenChange,
    );
  }

  private requireBundle(): Promise<LoadedWebBundle> {
    if (this.active !== null) {
      return Promise.resolve(this.active);
    }
    if (this.activation === null) {
      this.activation = this.loadBundle().then((bundle) => {
        this.active = bundle;
        return bundle;
      }).catch((error: unknown) => {
        this.activation = null;
        throw error;
      });
    }
    return this.activation;
  }

  private async activeStorageGame(): Promise<WebStorageGame | null> {
    const bundle = await this.requireBundle().catch(() => null);
    return bundle === null
      ? null
      : { game: bundle.game, identity: bundle.identity };
  }

  private runSettingsExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.settingsQueue.then(operation, operation);
    this.settingsQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private authoritativeWindowMode(): PlayerSettings['windowMode'] {
    return this.fullscreenDocument?.fullscreenElement
      ? 'fullscreen'
      : 'windowed';
  }

  private withAuthoritativeFullscreenMode(
    settings: PlayerSettings,
  ): PlayerSettings {
    return {
      ...settings,
      windowMode: this.authoritativeWindowMode(),
    };
  }

  private applyFullscreenMode(
    mode: PlayerSettings['windowMode'],
  ): Promise<void> {
    const fullscreenDocument = this.fullscreenDocument;
    if (!this.fullscreenControlsEnabled || fullscreenDocument === null) {
      return Promise.reject(new Error('Fullscreen API unavailable'));
    }
    if (mode === 'fullscreen') {
      if (fullscreenDocument.fullscreenElement !== null) {
        return Promise.resolve();
      }
      try {
        return Promise.resolve(
          fullscreenDocument.documentElement.requestFullscreen(),
        );
      } catch (error) {
        return Promise.reject(error);
      }
    }
    if (fullscreenDocument.fullscreenElement === null) {
      return Promise.resolve();
    }
    try {
      return Promise.resolve(fullscreenDocument.exitFullscreen());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private persistAuthoritativeFullscreenMode(): Promise<void> {
    return this.runSettingsExclusive(async () => {
      let current = this.settingsCache;
      if (current === null) {
        const loaded = await this.storage.readSettings();
        if (loaded.status === 'rejected') {
          return;
        }
        current = loaded.settings;
      }
      const next = this.withAuthoritativeFullscreenMode(current);
      if (next.windowMode === current.windowMode) {
        this.settingsCache = next;
        return;
      }
      const result = await this.storage.writeSettings(next);
      if (result.status === 'updated') {
        this.settingsCache = result.settings;
      }
    });
  }
}

export const webPlayerGateway = new WebPlayerGateway();
