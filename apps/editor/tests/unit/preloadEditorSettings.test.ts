/**
 * 文件主要作用：验证 preload Editor settings API 的行为。
 * 测试覆盖：`preload Editor settings API`。
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VnEditorSettingsApi } from '../../src/shared/editorSettingsProtocol';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

describe('preload Editor settings API', () => {
  let settingsApi: VnEditorSettingsApi;

  beforeAll(async () => {
    await import('../../src/preload');
    const exposure = electron.exposeInMainWorld.mock.calls.find(
      ([name]) => name === 'vnEditorSettings',
    );
    if (!exposure) {
      throw new Error('preload did not expose vnEditorSettings');
    }
    settingsApi = exposure[1] as VnEditorSettingsApi;
  });

  beforeEach(() => {
    electron.invoke.mockReset();
    electron.invoke.mockResolvedValue({});
    electron.on.mockClear();
    electron.removeListener.mockClear();
  });

  it('forwards only fixed get and narrow update invocations', async () => {
    await settingsApi.getSettings();
    await settingsApi.updateSettings({ language: 'en-US' });
    await settingsApi.updateSettings({ colorTheme: 'moonlight' });

    expect(electron.invoke.mock.calls).toEqual([
      ['vn-editor-settings:request', {
        action: 'get-settings',
        params: {},
      }],
      ['vn-editor-settings:request', {
        action: 'update-settings',
        params: { patch: { language: 'en-US' } },
      }],
      ['vn-editor-settings:request', {
        action: 'update-settings',
        params: { patch: { colorTheme: 'moonlight' } },
      }],
    ]);
  });

  it('validates changed snapshots and removes the exact listener', () => {
    const listener = vi.fn();
    const unsubscribe = settingsApi.onChanged(listener);
    const registered = electron.on.mock.calls[0]?.[1] as (
      event: unknown,
      settings: unknown,
    ) => void;

    registered({}, {
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'moonlight',
    });
    registered({}, {
      settingsVersion: 2,
      language: 'fr-FR',
      colorTheme: 'daylight',
    });
    registered({}, {
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'daylight',
      injected: true,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'moonlight',
    });

    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledWith(
      'vn-editor-settings:changed',
      registered,
    );
  });
});
