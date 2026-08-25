import { describe, expect, it, vi } from 'vitest';

import { EditorSettingsManager } from '../../src/main/settings/EditorSettingsManager';
import type { EditorSettings } from '../../src/shared/editorSettingsProtocol';

class FakeStore {
  current: EditorSettings = { settingsVersion: 1, language: 'zh-CN' };
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

    const result = await manager.updateSettings({ language: 'en-US' });

    expect(result).toEqual({
      status: 'updated',
      settings: { settingsVersion: 1, language: 'en-US' },
    });
    expect(first).toHaveBeenCalledWith({ settingsVersion: 1, language: 'en-US' });
    expect(second).toHaveBeenCalledWith({ settingsVersion: 1, language: 'en-US' });
    await expect(manager.getSettings()).resolves.toEqual({
      status: 'ready',
      settings: { settingsVersion: 1, language: 'en-US' },
    });
  });

  it('keeps the authoritative language unchanged when persistence fails', async () => {
    const store = new FakeStore();
    store.failWrite = true;
    const listener = vi.fn();
    const manager = new EditorSettingsManager(store);
    manager.subscribe(listener);

    await expect(manager.updateSettings({ language: 'en-US' })).resolves.toEqual({
      status: 'rejected',
      error: 'settings-storage-unavailable',
    });
    await expect(manager.getSettings()).resolves.toMatchObject({
      settings: { language: 'zh-CN' },
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
