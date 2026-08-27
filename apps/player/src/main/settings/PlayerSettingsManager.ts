/**
 * 主要作用：协调设置持久化、音量语言及窗口大小/全屏应用。
 * 关键函数与实现：`FULLSCREEN_TRANSITION_TIMEOUT_MS`、`PLAYER_WINDOW_SIZE_PRESETS`、`PlayerSettingsController`、`PlayerSettingsManager`；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
import type { BrowserWindow, Rectangle } from 'electron';

import {
  createDefaultPlayerSettings,
  isPlayerSettingsPatch,
  isPlayerSettings,
  type PlayerErrorCode,
  type PlayerSettings,
  type PlayerSettingsPatch,
  type PlayerSettingsReadResult,
  type PlayerSettingsWriteResult,
  type PlayerWindowSizePreset,
} from '../../shared/playerProtocol';
import type { PlayerSettingsStore } from './PlayerSettingsStore';

const SETTINGS_STORAGE_ERROR: PlayerErrorCode = 'settings-storage-unavailable';
const INVALID_SETTINGS_ERROR: PlayerErrorCode = 'settings-invalid';
export const FULLSCREEN_TRANSITION_TIMEOUT_MS = 5_000;

export const PLAYER_WINDOW_SIZE_PRESETS: Readonly<
  Record<PlayerWindowSizePreset, Readonly<{ width: number; height: number }>>
> = Object.freeze({
  small: Object.freeze({ width: 960, height: 600 }),
  medium: Object.freeze({ width: 1280, height: 800 }),
  large: Object.freeze({ width: 1600, height: 1000 }),
});

export type PlayerSettingsController = {
  getSettings(): Promise<PlayerSettingsReadResult>;
  updateSettings(patch: PlayerSettingsPatch): Promise<PlayerSettingsWriteResult>;
};

type WorkAreaResolver = (bounds: Rectangle) => Rectangle;

type WindowActivationGate = {
  promise: Promise<void>;
  resolve: () => void;
  settled: boolean;
};

function createWindowActivationGate(): WindowActivationGate {
  let resolvePromise!: () => void;
  const gate: WindowActivationGate = {
    promise: new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve: () => {
      if (gate.settled) {
        return;
      }
      gate.settled = true;
      resolvePromise();
    },
    settled: false,
  };
  return gate;
}

function cloneSettings(settings: PlayerSettings): PlayerSettings {
  return { ...settings };
}

function safePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export class PlayerSettingsManager {
  private current = createDefaultPlayerSettings();
  private operationQueue: Promise<void> = Promise.resolve();
  private initialization: Promise<void> | null = null;
  private initialized = false;
  private stopping = false;
  private readonly windows = new Set<BrowserWindow>();
  private readonly activatedWindows = new Set<BrowserWindow>();
  private readonly activationGates = new Map<BrowserWindow, WindowActivationGate>();

  constructor(
    private readonly store: PlayerSettingsStore,
    private readonly resolveWorkArea: WorkAreaResolver,
    private readonly reportError: (operation: string, error: unknown) => void = () => {},
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialization ??= (async () => {
      try {
        this.current = await this.store.load();
      } catch (error) {
        this.reportError('load', error);
        this.current = createDefaultPlayerSettings();
      }
      this.initialized = true;
    })();
    await this.initialization;
  }

  async attachWindow(window: BrowserWindow): Promise<PlayerSettingsController> {
    await this.initialize();
    if (!this.windows.has(window)) {
      this.windows.add(window);
      this.activationGates.set(window, createWindowActivationGate());
      const captureNativeMode = (): void => {
        if (!this.stopping) {
          void this.captureWindowMode(window).catch((error) => {
            this.reportError('capture-native-window-mode', error);
          });
        }
      };
      window.on('enter-full-screen', captureNativeMode);
      window.on('leave-full-screen', captureNativeMode);
      window.once('closed', () => {
        this.activationGates.get(window)?.resolve();
        this.activationGates.delete(window);
        this.windows.delete(window);
        this.activatedWindows.delete(window);
        window.removeListener('enter-full-screen', captureNativeMode);
        window.removeListener('leave-full-screen', captureNativeMode);
      });
      // Sizing a hidden window is safe, but native fullscreen transitions can
      // depend on a loaded/showable BrowserWindow (especially on macOS).
      // Main calls activateWindow after loadURL resolves and before showing the
      // window, so persisted fullscreen cannot flash a windowed frame.
      this.applyWindowedPreset(window, this.current.windowSizePreset);
    }
    return {
      getSettings: () => this.getSettings(window),
      updateSettings: (patch) => this.updateSettings(window, patch),
    };
  }

  activateWindow(window: BrowserWindow): Promise<void> {
    this.activatedWindows.add(window);
    const activation = this.runExclusive(async () => {
      try {
        await this.applyToWindow(window, this.current);
      } catch (error) {
        this.reportError('apply-window', error);
        await this.syncAuthoritativeWindowMode(window);
      }
    });
    return activation.finally(() => {
      this.activationGates.get(window)?.resolve();
    });
  }

  shutdown(): Promise<void> {
    this.stopping = true;
    return this.operationQueue;
  }

  private async getSettings(
    window: BrowserWindow,
  ): Promise<PlayerSettingsReadResult> {
    await this.waitForWindowActivation(window);
    return this.runExclusive(async () => {
      if (this.activatedWindows.has(window)) {
        await this.syncAuthoritativeWindowMode(window);
      }
      return { status: 'ready', settings: cloneSettings(this.current) };
    });
  }

  private async updateSettings(
    authoritativeWindow: BrowserWindow,
    patch: PlayerSettingsPatch,
  ): Promise<PlayerSettingsWriteResult> {
    await this.waitForWindowActivation(authoritativeWindow);
    if (this.stopping) {
      return Promise.resolve({
        status: 'rejected',
        error: INVALID_SETTINGS_ERROR,
      });
    }
    return this.runExclusive(async () => {
      if (!isPlayerSettingsPatch(patch)) {
        return { status: 'rejected', error: INVALID_SETTINGS_ERROR };
      }
      const appliesWindowGeometry =
        Object.prototype.hasOwnProperty.call(patch, 'windowMode') ||
        Object.prototype.hasOwnProperty.call(patch, 'windowSizePreset');
      if (this.activatedWindows.has(authoritativeWindow)) {
        await this.syncAuthoritativeWindowMode(authoritativeWindow);
      }
      const settings: PlayerSettings = {
        ...this.current,
        ...patch,
      };
      if (!isPlayerSettings(settings)) {
        return { status: 'rejected', error: INVALID_SETTINGS_ERROR };
      }
      let persisted: PlayerSettings;
      try {
        persisted = await this.store.write(settings);
      } catch (error) {
        this.reportError('write', error);
        return { status: 'rejected', error: SETTINGS_STORAGE_ERROR };
      }
      this.current = persisted;
      if (appliesWindowGeometry) {
        for (const window of this.windows) {
          try {
            if (this.activatedWindows.has(window)) {
              await this.applyToWindow(window, persisted);
            } else {
              this.applyWindowedPreset(window, persisted.windowSizePreset);
            }
          } catch (error) {
            this.reportError('apply-window', error);
          }
        }
      }
      if (this.activatedWindows.has(authoritativeWindow)) {
        await this.syncAuthoritativeWindowMode(authoritativeWindow);
      }
      return { status: 'updated', settings: cloneSettings(this.current) };
    });
  }

  private waitForWindowActivation(window: BrowserWindow): Promise<void> {
    return this.activationGates.get(window)?.promise ?? Promise.resolve();
  }

  private captureWindowMode(window: BrowserWindow): Promise<void> {
    return this.runExclusive(async () => {
      await this.syncAuthoritativeWindowMode(window);
      if (
        this.activatedWindows.has(window) &&
        !window.isDestroyed() &&
        !window.isFullScreen()
      ) {
        this.applyWindowedPreset(window, this.current.windowSizePreset);
      }
    });
  }

  private async syncAuthoritativeWindowMode(window: BrowserWindow): Promise<void> {
    if (window.isDestroyed()) {
      return;
    }
    const windowMode = window.isFullScreen() ? 'fullscreen' : 'windowed';
    if (windowMode === this.current.windowMode) {
      return;
    }
    const candidate: PlayerSettings = {
      ...this.current,
      windowMode,
    };
    this.current = candidate;
    try {
      this.current = await this.store.write(candidate);
    } catch (error) {
      // The actual BrowserWindow state remains authoritative for this session.
      // A storage failure must not make fullscreen interaction unusable.
      this.reportError('sync-native-window-mode', error);
    }
  }

  private async applyToWindow(
    window: BrowserWindow,
    settings: PlayerSettings,
  ): Promise<void> {
    if (window.isDestroyed()) {
      return;
    }
    if (settings.windowMode === 'fullscreen') {
      if (!window.isFullScreen()) {
        this.applyWindowedPreset(window, settings.windowSizePreset);
        await this.transitionFullScreen(window, true);
      }
      return;
    }
    if (window.isFullScreen()) {
      await this.transitionFullScreen(window, false);
    }
    if (!window.isDestroyed()) {
      this.applyWindowedPreset(window, settings.windowSizePreset);
    }
  }

  private transitionFullScreen(
    window: BrowserWindow,
    fullscreen: boolean,
  ): Promise<void> {
    if (window.isDestroyed() || window.isFullScreen() === fullscreen) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const removeStateListener = (): void => {
        if (fullscreen) {
          window.removeListener('enter-full-screen', finish);
        } else {
          window.removeListener('leave-full-screen', finish);
        }
      };
      const settle = (error?: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        removeStateListener();
        window.removeListener('closed', finish);
        if (timeout !== null) {
          clearTimeout(timeout);
        }
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      };
      const finish = (): void => settle();
      if (fullscreen) {
        window.once('enter-full-screen', finish);
      } else {
        window.once('leave-full-screen', finish);
      }
      window.once('closed', finish);
      try {
        window.setFullScreen(fullscreen);
      } catch (error) {
        settle(error);
        return;
      }
      if (!settled) {
        timeout = setTimeout(() => {
          if (window.isDestroyed() || window.isFullScreen() === fullscreen) {
            settle();
            return;
          }
          settle(new Error('Player fullscreen transition timed out'));
        }, FULLSCREEN_TRANSITION_TIMEOUT_MS);
      }
    });
  }

  private applyWindowedPreset(
    window: BrowserWindow,
    presetName: PlayerWindowSizePreset,
  ): void {
    const preset = PLAYER_WINDOW_SIZE_PRESETS[presetName];
    const beforeBounds = window.getBounds();
    const beforeContentBounds = window.getContentBounds();
    const workArea = this.resolveWorkArea(beforeBounds);
    const workWidth = safePositiveInteger(workArea.width, preset.width);
    const workHeight = safePositiveInteger(workArea.height, preset.height);
    const frameWidth = Math.max(0, beforeBounds.width - beforeContentBounds.width);
    const frameHeight = Math.max(0, beforeBounds.height - beforeContentBounds.height);
    const maximumContentWidth = Math.max(1, workWidth - frameWidth);
    const maximumContentHeight = Math.max(1, workHeight - frameHeight);
    const scale = Math.min(
      1,
      maximumContentWidth / preset.width,
      maximumContentHeight / preset.height,
    );
    const width = Math.max(1, Math.floor(preset.width * scale));
    const height = Math.max(1, Math.floor(preset.height * scale));

    window.setMinimumSize(
      Math.min(PLAYER_WINDOW_SIZE_PRESETS.small.width, width),
      Math.min(PLAYER_WINDOW_SIZE_PRESETS.small.height, height),
    );
    window.setContentSize(width, height, false);
    const resizedBounds = window.getBounds();
    const workX = Number.isFinite(workArea.x) ? Math.floor(workArea.x) : 0;
    const workY = Number.isFinite(workArea.y) ? Math.floor(workArea.y) : 0;
    const x = workX + Math.max(0, Math.floor((workWidth - resizedBounds.width) / 2));
    const y = workY + Math.max(0, Math.floor((workHeight - resizedBounds.height) / 2));
    window.setPosition(x, y, false);
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
