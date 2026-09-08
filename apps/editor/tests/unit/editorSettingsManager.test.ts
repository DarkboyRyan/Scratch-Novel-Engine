/**
 * 文件主要作用：验证 EditorSettingsManager 的行为。
 * 测试覆盖：`EditorSettingsManager`。
 */

import { describe, expect, it, vi } from 'vitest';

import { EditorSettingsManager } from '../../src/main/settings/EditorSettingsManager';
import type { EditorSettings } from '../../src/shared/editorSettingsProtocol';

class FakeStore {
  current: EditorSettings = {
    settingsVersion: 2,
    language: 'zh-CN',
    colorTheme: 'daylight',
  };
  failWrite = false;

  async load(): Promise<EditorSettings> {
    return { ...this.current };
  }

  async write(settings: EditorSettings): Promise<EditorSettings> {
    if (this.failWrite) {
      throw new Error('disk unavailable');
    }
    this.current = { ...settings };
    return { ...this.current };
  }
}

describe('EditorSettingsManager', () => {
  it('serializes global changes and notifies every subscriber with snapshots', async () => {
    const store = new FakeStore();
    const manager = new EditorSettingsManager(store);
    const first = vi.fn();
    const second = vi.fn();
    manager.subscribe(first);
    manager.subscribe(second);

    const result = await manager.updateSettings({ colorTheme: 'moonlight' });

    expect(manager.language).toBe('zh-CN');
    expect(result).toEqual({
      status: 'updated',
      settings: {
        settingsVersion: 2,
        language: 'zh-CN',
        colorTheme: 'moonlight',
      },
    });
    expect(first).toHaveBeenCalledWith({
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'moonlight',
    });
    expect(second).toHaveBeenCalledWith({
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'moonlight',
    });
    await expect(manager.getSettings()).resolves.toEqual({
      status: 'ready',
      settings: {
        settingsVersion: 2,
        language: 'zh-CN',
        colorTheme: 'moonlight',
      },
    });
  });

  it('keeps the authoritative theme unchanged when persistence fails', async () => {
    const store = new FakeStore();
    store.failWrite = true;
    const listener = vi.fn();
    const manager = new EditorSettingsManager(store);
    manager.subscribe(listener);

    await expect(
      manager.updateSettings({ colorTheme: 'moonlight' }),
    ).resolves.toEqual({
      status: 'rejected',
      error: 'settings-storage-unavailable',
    });
    await expect(manager.getSettings()).resolves.toMatchObject({
      settings: { colorTheme: 'daylight' },
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
