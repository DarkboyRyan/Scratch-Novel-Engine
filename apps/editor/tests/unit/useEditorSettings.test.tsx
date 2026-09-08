/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 useEditorSettings 的行为。
 * 测试覆盖：`useEditorSettings`。
 */

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorSettings } from '../../src/renderer/hooks/useEditorSettings';
import type {
  EditorColorTheme,
  EditorLanguage,
  EditorSettings,
  EditorSettingsReadResult,
  EditorSettingsWriteResult,
} from '../../src/shared/editorSettingsProtocol';

function settings(
  language: EditorLanguage,
  colorTheme: EditorColorTheme = 'daylight',
): EditorSettings {
  return { settingsVersion: 2, language, colorTheme };
}

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
};

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('useEditorSettings', () => {
  let container: HTMLDivElement;
  let root: Root;
  let changedListener: ((settings: EditorSettings) => void) | null;
  let latest: ReturnType<typeof useEditorSettings> | null;
  let getSettings: ReturnType<typeof vi.fn>;
  let updateSettings: ReturnType<typeof vi.fn>;

  function Harness() {
    const state = useEditorSettings();
    useEffect(() => {
      latest = state;
    }, [state]);
    return (
      <output>
        {state.settings
          ? `${state.settings.language}:${state.settings.colorTheme}`
          : 'loading'}
      </output>
    );
  }

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    changedListener = null;
    latest = null;
    getSettings = vi.fn();
    updateSettings = vi.fn();
    Object.defineProperty(window, 'vnEditorSettings', {
      configurable: true,
      value: {
        getSettings,
        updateSettings,
        onChanged: (listener: (settings: EditorSettings) => void) => {
          changedListener = listener;
          return () => {
            changedListener = null;
          };
        },
      },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not let a stale initial read overwrite a newer cross-window event', async () => {
    const read = deferred<EditorSettingsReadResult>();
    getSettings.mockReturnValue(read.promise);
    await act(async () => root.render(<Harness />));

    await act(async () => changedListener?.(settings('en-US', 'moonlight')));
    read.resolve({
      status: 'ready',
      settings: settings('zh-CN'),
    });
    await act(async () => read.promise);

    expect(container.textContent).toBe('en-US:moonlight');
  });

  it('requires a restart without reporting a storage failure when the preload API is missing', async () => {
    Object.defineProperty(window, 'vnEditorSettings', {
      configurable: true,
      value: undefined,
    });

    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    expect(container.textContent).toBe('zh-CN:daylight');
    expect(latest?.restartRequired).toBe(true);
    expect(latest?.saveFailed).toBe(false);
    await act(async () => latest!.changeLanguage('en-US'));
    expect(container.textContent).toBe('zh-CN:daylight');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('requires a restart when an older Main process returns the v1 settings shape', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: { settingsVersion: 1, language: 'en-US' },
    });

    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    expect(container.textContent).toBe('zh-CN:daylight');
    expect(latest?.restartRequired).toBe(true);
    expect(latest?.saveFailed).toBe(false);
  });

  it('requires a restart when the running Main process has no settings handler', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: settings('zh-CN'),
    });
    updateSettings.mockRejectedValue(new Error(
      "Error invoking remote method 'vn-editor-settings:request': " +
      "Error: No handler registered for 'vn-editor-settings:request'",
    ));
    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    await act(async () => latest!.changeLanguage('en-US'));

    expect(container.textContent).toBe('zh-CN:daylight');
    expect(latest?.restartRequired).toBe(true);
    expect(latest?.saveFailed).toBe(false);
  });

  it('requires a restart when an older Main process rejects the new theme patch', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: settings('zh-CN'),
    });
    updateSettings.mockResolvedValue({
      status: 'rejected',
      error: 'settings-invalid',
    });
    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    await act(async () => latest!.changeColorTheme('moonlight'));

    expect(container.textContent).toBe('zh-CN:daylight');
    expect(latest?.restartRequired).toBe(true);
    expect(latest?.saveFailed).toBe(false);
  });

  it('does not let a stale update response overwrite a newer cross-window event', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: settings('zh-CN'),
    });
    const write = deferred<EditorSettingsWriteResult>();
    updateSettings.mockReturnValue(write.promise);
    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    let change!: Promise<void>;
    await act(async () => {
      change = latest!.changeLanguage('en-US');
    });
    await act(async () => changedListener?.(settings('zh-CN')));
    write.resolve({
      status: 'updated',
      settings: settings('en-US'),
    });
    await act(async () => change);

    expect(container.textContent).toBe('zh-CN:daylight');
    expect(latest?.saveFailed).toBe(false);
  });

  it('keeps a newer authoritative event when an older write fails', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: settings('zh-CN'),
    });
    const write = deferred<EditorSettingsWriteResult>();
    updateSettings.mockReturnValue(write.promise);
    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    let change!: Promise<void>;
    await act(async () => {
      change = latest!.changeLanguage('en-US');
    });
    await act(async () => changedListener?.(settings('en-US', 'moonlight')));
    write.resolve({
      status: 'rejected',
      error: 'settings-storage-unavailable',
    });
    await act(async () => change);

    expect(container.textContent).toBe('en-US:moonlight');
    expect(latest?.saveFailed).toBe(false);
  });

  it('optimistically applies and persists the Moonlight theme', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: settings('zh-CN'),
    });
    const write = deferred<EditorSettingsWriteResult>();
    updateSettings.mockReturnValue(write.promise);
    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    let change!: Promise<void>;
    await act(async () => {
      change = latest!.changeColorTheme('moonlight');
    });
    expect(container.textContent).toBe('zh-CN:moonlight');
    expect(updateSettings).toHaveBeenCalledWith({ colorTheme: 'moonlight' });

    write.resolve({
      status: 'updated',
      settings: settings('zh-CN', 'moonlight'),
    });
    await act(async () => change);
    expect(container.textContent).toBe('zh-CN:moonlight');
    expect(latest?.saveFailed).toBe(false);
  });

  it('rolls a rejected theme write back to the authoritative theme', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: settings('zh-CN'),
    });
    updateSettings.mockResolvedValue({
      status: 'rejected',
      error: 'settings-storage-unavailable',
    });
    await act(async () => root.render(<Harness />));
    await act(async () => Promise.resolve());

    await act(async () => latest!.changeColorTheme('moonlight'));

    expect(container.textContent).toBe('zh-CN:daylight');
    expect(latest?.saveFailed).toBe(true);
  });
});
