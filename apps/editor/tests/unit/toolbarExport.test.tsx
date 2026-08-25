/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toolbar } from '../../src/renderer/components/Toolbar';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import type { GameExportRequest } from '../../src/shared/exportProtocol';

describe('Toolbar game export action', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function renderToolbar(
    options: {
      isBusy?: boolean;
      isExporting?: boolean;
      operationMessage?: string;
      onExportGame?: (request: GameExportRequest) => void;
      onLanguageChange?: (language: 'zh-CN' | 'en-US') => Promise<void>;
      onOpenSettings?: () => void;
      language?: 'zh-CN' | 'en-US';
      settingsRestartRequired?: boolean;
    } = {},
  ): void {
    const language = options.language ?? 'zh-CN';
    root.render(
      <EditorI18nProvider language={language}>
        <Toolbar
        projectName="Story"
        projectNameDraft="Story"
        isRenamingProject={false}
        editorMode="form"
        isBusy={options.isBusy ?? false}
        isDirty={false}
        isSaving={false}
        isExporting={options.isExporting ?? false}
        engineMessage=""
        operationMessage={options.operationMessage ?? ''}
        projectFolderName="Story"
        language={language}
        isSettingsSaving={false}
        settingsSaveFailed={false}
        settingsRestartRequired={options.settingsRestartRequired ?? false}
        onCreateProject={() => {}}
        onOpenProject={() => {}}
        onSaveProject={() => {}}
        onExportGame={options.onExportGame ?? (() => {})}
        onBeginRenameProject={() => {}}
        onProjectNameDraftChange={() => {}}
        onCommitProjectName={async () => true}
        onCancelProjectName={() => {}}
        onEditorModeChange={() => {}}
        onLanguageChange={options.onLanguageChange ?? (async () => {})}
        onOpenSettings={options.onOpenSettings ?? (() => {})}
        />
      </EditorI18nProvider>,
    );
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('opens export configuration and invokes a pathless bundle export', async () => {
    const onExportGame = vi.fn();

    await act(async () => renderToolbar({ onExportGame }));
    const exportButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '导出',
    );

    expect(exportButton).toBeDefined();
    await act(async () => exportButton!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    const submitButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (button) => button.textContent === '导出',
    );
    await act(async () => submitButton!.click());
    expect(onExportGame).toHaveBeenCalledWith({ output: 'runtime-bundle' });
    expect(JSON.stringify(onExportGame.mock.calls)).not.toContain('/');
  });

  it('collects only validated standalone metadata and documents the default icon', async () => {
    const onExportGame = vi.fn();
    await act(async () => renderToolbar({ onExportGame }));
    const exportButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '导出',
    );
    await act(async () => exportButton!.click());

    const output = document.querySelector('[aria-label="产物类型"]') as HTMLSelectElement;
    await act(async () => {
      output.value = 'standalone-application';
      output.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('模板默认图标');

    const applicationName = document.querySelector(
      '[aria-label="应用名称"]',
    ) as HTMLInputElement;
    const version = document.querySelector(
      '[aria-label="应用版本"]',
    ) as HTMLInputElement;
    const applicationId = document.querySelector(
      '[aria-label="Application ID"]',
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(applicationName, 'Standalone Story');
      setInputValue(version, '2.1.0');
      setInputValue(applicationId, 'com.example.standalone-story');
    });
    const submitButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (button) => button.textContent === '导出',
    );
    await act(async () => submitButton!.click());

    expect(onExportGame).toHaveBeenCalledWith({
      output: 'standalone-application',
      application: {
        name: 'Standalone Story',
        version: '2.1.0',
        applicationId: 'com.example.standalone-story',
      },
    });
  });

  it('submits a pathless Web ZIP request and explains HTTP deployment', async () => {
    const onExportGame = vi.fn();
    await act(async () => renderToolbar({ onExportGame }));
    const exportButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '导出',
    );
    await act(async () => exportButton!.click());

    const output = document.querySelector(
      '[aria-label="产物类型"]',
    ) as HTMLSelectElement;
    await act(async () => {
      output.value = 'web-player';
      output.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('HTTP/HTTPS');
    const submitButton = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="dialog"] button',
    )].find((button) => button.textContent === '导出');
    await act(async () => submitButton!.click());

    expect(onExportGame).toHaveBeenCalledWith({ output: 'web-player' });
    expect(JSON.stringify(onExportGame.mock.calls)).not.toContain('/');
  });

  it('shows a disabled exporting state and then the completed bundle name', async () => {
    await act(async () =>
      renderToolbar({
        isBusy: true,
        isExporting: true,
      }),
    );

    const exportButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '导出中…',
    );

    expect(exportButton).toBeInstanceOf(HTMLButtonElement);
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () =>
      renderToolbar({
        operationMessage: '已导出内容包 Story.vngame（3 项资源）',
      }),
    );
    const status = container.querySelector('.engine-ready');
    expect(status?.textContent).toContain('已导出内容包 Story.vngame');
  });

  it('opens Settings beside Export, changes language, traps focus and restores its trigger', async () => {
    const onLanguageChange = vi.fn().mockResolvedValue(undefined);
    const onOpenSettings = vi.fn();
    await act(async () => renderToolbar({
      onLanguageChange,
      onOpenSettings,
    }));
    const actions = container.querySelector('.project-file-actions');
    const buttons = [...actions!.querySelectorAll('button')];
    const exportIndex = buttons.findIndex((button) => button.textContent === '导出');
    const settingsButton = buttons[exportIndex + 1];
    expect(settingsButton?.textContent).toBe('设置');

    settingsButton.focus();
    await act(async () => settingsButton.click());
    await act(async () => Promise.resolve());
    const dialog = document.querySelector('[role="dialog"]');
    const language = dialog?.querySelector('select') as HTMLSelectElement;
    expect(document.activeElement).toBe(language);

    await act(async () => {
      language.value = 'en-US';
      language.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onLanguageChange).toHaveBeenCalledWith('en-US');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    await act(async () => Promise.resolve());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(settingsButton);
  });

  it('disables language changes and asks for a full restart when settings IPC is stale', async () => {
    const onLanguageChange = vi.fn().mockResolvedValue(undefined);
    await act(async () => renderToolbar({
      onLanguageChange,
      settingsRestartRequired: true,
    }));
    const settingsButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '设置',
    );
    await act(async () => settingsButton!.click());
    await act(async () => Promise.resolve());

    const language = document.querySelector(
      '[aria-label="界面语言"]',
    ) as HTMLSelectElement;
    const alert = document.querySelector('[role="alert"]');
    expect(language.disabled).toBe(true);
    expect(alert?.textContent).toContain('完全退出并重新启动');
    expect(document.activeElement?.textContent).toBe('关闭');
    expect(onLanguageChange).not.toHaveBeenCalled();

    const close = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="dialog"] button',
    )].find((button) => button.textContent === '关闭');
    await act(async () => close!.click());
    await act(async () => renderToolbar({
      language: 'en-US',
      settingsRestartRequired: true,
    }));
    const englishSettingsButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Settings',
    );
    await act(async () => englishSettingsButton!.click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Fully quit and restart',
    );
  });

  it('shows standalone metadata validation in the active English language', async () => {
    await act(async () => renderToolbar({ language: 'en-US' }));
    const exportButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Export',
    );
    await act(async () => exportButton!.click());
    const output = document.querySelector(
      '[aria-label="Artifact type"]',
    ) as HTMLSelectElement;
    await act(async () => {
      output.value = 'standalone-application';
      output.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const applicationName = document.querySelector(
      '[aria-label="Application name"]',
    ) as HTMLInputElement;
    await act(async () => setInputValue(applicationName, 'Invalid/Name'));
    const submit = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="dialog"] button',
    )].find((button) => button.textContent === 'Export');
    await act(async () => submit!.click());

    const error = document.querySelector('[role="alert"]');
    expect(error?.textContent).toContain('application name');
    expect(error?.textContent).not.toMatch(/[\p{Script=Han}]/u);

    await act(async () => renderToolbar({ language: 'zh-CN' }));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      '应用名称需为 1–80 个字符、不能过长，且不能包含系统保留字符',
    );
  });

  it('keeps Export and Settings mutually exclusive in the same event turn', async () => {
    await act(async () => renderToolbar());
    const actions = container.querySelector('.project-file-actions');
    const buttons = [...actions!.querySelectorAll('button')];
    const exportButton = buttons.find((button) => button.textContent === '导出');
    const settingsButton = buttons.find((button) => button.textContent === '设置');

    await act(async () => {
      exportButton!.click();
      settingsButton!.click();
    });

    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.textContent).toContain('Editor 设置');
    expect(dialogs[0]?.textContent).not.toContain('产物类型');
  });
});
