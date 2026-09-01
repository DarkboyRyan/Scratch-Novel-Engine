/**
 * 主要作用：验证设置写入、窗口预设、全屏切换和并发协调。
 * 关键函数与实现：测试套件“Player settings window manager”、`FakeSettingsStore`、`FakeWindow`、`asStore`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { EventEmitter } from 'node:events';

import type { BrowserWindow, Rectangle } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FULLSCREEN_TRANSITION_TIMEOUT_MS,
  PlayerSettingsManager,
} from '../../src/main/settings/PlayerSettingsManager';
import type { PlayerSettingsStore } from '../../src/main/settings/PlayerSettingsStore';
import {
  DEFAULT_PLAYER_SETTINGS,
  type PlayerSettings,
  type PlayerSettingsLanguageSource,
} from '../../src/shared/playerProtocol';

class FakeSettingsStore {
  current: PlayerSettings;
  readonly writes: PlayerSettings[] = [];

  constructor(initial: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS }) {
    this.current = { ...initial };
  }

  languageSource: PlayerSettingsLanguageSource = 'stored';

  async load() {
    return {
      settings: { ...this.current },
      languageSource: this.languageSource,
    };
  }

  async write(settings: PlayerSettings): Promise<PlayerSettings> {
    this.current = { ...settings };
    this.languageSource = 'stored';
    this.writes.push({ ...settings });
    return { ...settings };
  }
}

class FakeWindow extends EventEmitter {
  destroyed = false;
  fullscreen = false;
  autoCompleteFullscreen = true;
  contentWidth = 1280;
  contentHeight = 800;
  x = 0;
  y = 0;
  minimumSize: [number, number] = [960, 600];
  readonly operations: string[] = [];
  readonly frameWidth = 16;
  readonly frameHeight = 40;

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isFullScreen(): boolean {
    return this.fullscreen;
  }

  setFullScreen(fullscreen: boolean): void {
    this.operations.push(`fullscreen:${String(fullscreen)}`);
    if (!this.autoCompleteFullscreen) {
      return;
    }
    queueMicrotask(() => {
      this.fullscreen = fullscreen;
      this.emit(fullscreen ? 'enter-full-screen' : 'leave-full-screen');
    });
  }

  nativeFullScreen(fullscreen: boolean): void {
    this.fullscreen = fullscreen;
    this.emit(fullscreen ? 'enter-full-screen' : 'leave-full-screen');
  }

  getBounds(): Rectangle {
    return {
      x: this.x,
      y: this.y,
      width: this.contentWidth + this.frameWidth,
      height: this.contentHeight + this.frameHeight,
    };
  }

  getContentBounds(): Rectangle {
    return {
      x: this.x,
      y: this.y,
      width: this.contentWidth,
      height: this.contentHeight,
    };
  }

  setMinimumSize(width: number, height: number): void {
    this.minimumSize = [width, height];
  }

  setContentSize(width: number, height: number): void {
    this.operations.push(`size:${width}x${height}`);
    this.contentWidth = width;
    this.contentHeight = height;
  }

  setPosition(x: number, y: number): void {
    this.operations.push(`position:${x},${y}`);
    this.x = x;
    this.y = y;
  }
}

function asStore(store: FakeSettingsStore): PlayerSettingsStore {
  return store as unknown as PlayerSettingsStore;
}

function asWindow(window: FakeWindow): BrowserWindow {
  return window as unknown as BrowserWindow;
}

const spaciousWorkArea: Rectangle = {
  x: 0,
  y: 0,
  width: 3000,
  height: 2000,
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Player settings window manager', () => {
  it('keeps default language provenance through native window sync until an explicit update', async () => {
    const store = new FakeSettingsStore();
    store.languageSource = 'default';
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));

    window.nativeFullScreen(true);
    await expect(controller.getSettings()).resolves.toMatchObject({
      status: 'ready',
      languageSource: 'default',
      settings: { language: 'zh-CN', windowMode: 'fullscreen' },
    });
    expect(store.writes).toEqual([]);

    await expect(controller.updateSettings({ language: 'en-US' })).resolves
      .toMatchObject({ status: 'updated', settings: { language: 'en-US' } });
    await expect(controller.getSettings()).resolves.toMatchObject({
      status: 'ready',
      languageSource: 'stored',
      settings: { language: 'en-US', windowMode: 'fullscreen' },
    });
    expect(store.writes).toHaveLength(1);
  });

  it('does not request persisted fullscreen until Main activates a loaded window', async () => {
    const store = new FakeSettingsStore({
      ...DEFAULT_PLAYER_SETTINGS,
      windowMode: 'fullscreen',
      windowSizePreset: 'large',
    });
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));

    expect(window.operations).not.toContain('fullscreen:true');
    let settingsSettled = false;
    const settingsRead = controller.getSettings().then((result) => {
      settingsSettled = true;
      return result;
    });
    await Promise.resolve();
    expect(settingsSettled).toBe(false);
    expect(store.writes).toEqual([]);

    await manager.activateWindow(asWindow(window));
    await expect(settingsRead).resolves.toMatchObject({
      status: 'ready',
      settings: { windowMode: 'fullscreen', windowSizePreset: 'large' },
    });
    expect(window.operations).toContain('fullscreen:true');
    expect(window.fullscreen).toBe(true);
  });

  it('waits for native fullscreen exit before resizing a windowed preset', async () => {
    const store = new FakeSettingsStore();
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));
    window.nativeFullScreen(true);
    await controller.getSettings();
    window.operations.splice(0);

    const result = await controller.updateSettings({
      windowMode: 'windowed',
      windowSizePreset: 'small',
    });
    expect(result).toMatchObject({
      status: 'updated',
      settings: { windowMode: 'windowed', windowSizePreset: 'small' },
    });
    expect(window.operations[0]).toBe('fullscreen:false');
    expect(window.operations.indexOf('size:960x600')).toBeGreaterThan(0);
  });

  it('maps all presets exactly when they fit and safely shrinks large to workArea', async () => {
    const store = new FakeSettingsStore();
    const window = new FakeWindow();
    let workArea = spaciousWorkArea;
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => workArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));

    for (const [preset, expected] of [
      ['small', [960, 600]],
      ['medium', [1280, 800]],
      ['large', [1600, 1000]],
    ] as const) {
      await controller.updateSettings({ windowSizePreset: preset });
      expect([window.contentWidth, window.contentHeight]).toEqual(expected);
    }

    workArea = { x: 50, y: 20, width: 1366, height: 768 };
    const result = await controller.updateSettings({ windowSizePreset: 'large' });
    expect(result).toMatchObject({
      status: 'updated',
      settings: { windowSizePreset: 'large' },
    });
    const bounds = window.getBounds();
    expect(bounds.width).toBeLessThanOrEqual(workArea.width);
    expect(bounds.height).toBeLessThanOrEqual(workArea.height);
    expect(bounds.x).toBeGreaterThanOrEqual(workArea.x);
    expect(bounds.y).toBeGreaterThanOrEqual(workArea.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      workArea.x + workArea.width,
    );
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      workArea.y + workArea.height,
    );
    expect(bounds.x).toBe(
      workArea.x + Math.floor((workArea.width - bounds.width) / 2),
    );
    expect(bounds.y).toBe(
      workArea.y + Math.floor((workArea.height - bounds.height) / 2),
    );
    expect(store.current.windowSizePreset).toBe('large');
  });

  it('merges narrow patches with native fullscreen authority without lost updates', async () => {
    const store = new FakeSettingsStore();
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));

    window.nativeFullScreen(true);
    await expect(controller.getSettings()).resolves.toMatchObject({
      settings: { windowMode: 'fullscreen' },
    });
    await expect(controller.updateSettings({ bgmVolume: 0.2 })).resolves.toMatchObject({
      status: 'updated',
      settings: { bgmVolume: 0.2, windowMode: 'fullscreen' },
    });
    expect(window.fullscreen).toBe(true);
    expect(store.current).toMatchObject({
      bgmVolume: 0.2,
      windowMode: 'fullscreen',
    });

    await controller.updateSettings({ windowSizePreset: 'large' });
    expect(window.contentWidth).not.toBe(1600);
    window.nativeFullScreen(false);
    await controller.getSettings();
    expect([window.contentWidth, window.contentHeight]).toEqual([1600, 1000]);
    window.operations.splice(0);
    await expect(controller.updateSettings({ voiceVolume: 0.3 })).resolves.toMatchObject({
      status: 'updated',
      settings: { voiceVolume: 0.3, windowMode: 'windowed' },
    });
    expect(window.operations).not.toContain('fullscreen:true');
    expect(store.current.windowMode).toBe('windowed');
  });

  it('serializes concurrent patches and merges each against the latest state', async () => {
    const store = new FakeSettingsStore();
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));

    const [masterResult, videoResult, languageResult] = await Promise.all([
      controller.updateSettings({ masterVolume: 0.4 }),
      controller.updateSettings({ videoVolume: 0.6 }),
      controller.updateSettings({ language: 'en-US' }),
    ]);
    expect(masterResult).toMatchObject({
      status: 'updated',
      settings: { masterVolume: 0.4, videoVolume: 1 },
    });
    expect(videoResult).toMatchObject({
      status: 'updated',
      settings: { masterVolume: 0.4, videoVolume: 0.6 },
    });
    expect(languageResult).toMatchObject({
      status: 'updated',
      settings: {
        language: 'en-US',
        masterVolume: 0.4,
        videoVolume: 0.6,
      },
    });
    expect(store.writes.at(-1)).toMatchObject({
      language: 'en-US',
      masterVolume: 0.4,
      videoVolume: 0.6,
    });
  });

  it('does not resize or recenter a user-managed window for volume-only patches', async () => {
    const store = new FakeSettingsStore();
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));
    window.operations.splice(0);

    await expect(controller.updateSettings({ bgmVolume: 0.2 })).resolves
      .toMatchObject({
        status: 'updated',
        settings: { bgmVolume: 0.2 },
      });

    expect(window.operations).not.toContainEqual(
      expect.stringMatching(/^(?:size|position|fullscreen):/u),
    );
  });

  it('returns stable codes for invalid settings and persistence failures', async () => {
    const store = new FakeSettingsStore();
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));

    await expect(controller.updateSettings({
      language: 'fr-FR',
    } as never)).resolves.toEqual({
      status: 'rejected',
      error: 'settings-invalid',
    });
    store.write = async () => { throw new Error('/private/settings'); };
    await expect(controller.updateSettings({ masterVolume: 0.5 })).resolves
      .toEqual({
        status: 'rejected',
        error: 'settings-storage-unavailable',
      });
  });

  it('safely ignores a destroyed window while preserving settings', async () => {
    const store = new FakeSettingsStore();
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));
    window.destroyed = true;
    window.emit('closed');

    await expect(controller.updateSettings({ masterVolume: 0.35 })).resolves.toMatchObject({
      status: 'updated',
      settings: { masterVolume: 0.35 },
    });
    await expect(controller.getSettings()).resolves.toMatchObject({
      status: 'ready',
      settings: { masterVolume: 0.35 },
    });
  });

  it('bounds a missing fullscreen event and releases the serialized queue', async () => {
    vi.useFakeTimers();
    const reportError = vi.fn();
    const store = new FakeSettingsStore({
      ...DEFAULT_PLAYER_SETTINGS,
      windowMode: 'fullscreen',
    });
    const window = new FakeWindow();
    window.autoCompleteFullscreen = false;
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
      reportError,
    );
    const controller = await manager.attachWindow(asWindow(window));
    const activation = manager.activateWindow(asWindow(window));
    await vi.advanceTimersByTimeAsync(FULLSCREEN_TRANSITION_TIMEOUT_MS);
    await expect(activation).resolves.toBeUndefined();
    await expect(controller.getSettings()).resolves.toMatchObject({
      status: 'ready',
      settings: { windowMode: 'windowed' },
    });
    expect(reportError).toHaveBeenCalledWith(
      'apply-window',
      expect.objectContaining({ message: 'Player fullscreen transition timed out' }),
    );
  });

  it('waits for an already accepted final write during shutdown', async () => {
    const started = deferred();
    const gate = deferred();
    const store = new FakeSettingsStore();
    store.write = async (settings) => {
      started.resolve();
      await gate.promise;
      store.current = { ...settings };
      store.writes.push({ ...settings });
      return { ...settings };
    };
    const window = new FakeWindow();
    const manager = new PlayerSettingsManager(
      asStore(store),
      () => spaciousWorkArea,
    );
    const controller = await manager.attachWindow(asWindow(window));
    await manager.activateWindow(asWindow(window));
    const update = controller.updateSettings({ videoVolume: 0.45 });
    await started.promise;
    const shutdown = manager.shutdown();
    let flushed = false;
    void shutdown.then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    gate.resolve();
    await expect(update).resolves.toMatchObject({ status: 'updated' });
    await expect(shutdown).resolves.toBeUndefined();
    expect(store.current.videoVolume).toBe(0.45);
  });
});
