/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Toolbar 对表单、图形化和只读代码三种视图的入口。
 * 测试覆盖：三个模式按钮、本地化标签、选中态与模式回调。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorMode } from '../../src/renderer/application/editorMode';
import { Toolbar } from '../../src/renderer/components/Toolbar';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import type { EditorLanguage } from '../../src/shared/editorSettingsProtocol';

describe('Toolbar editor modes', () => {
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

  async function renderToolbar(
    language: EditorLanguage,
    editorMode: EditorMode,
    onEditorModeChange: (mode: EditorMode) => void,
  ): Promise<void> {
    await act(async () => {
      root.render(
        <EditorI18nProvider language={language}>
          <Toolbar
            projectName="Story"
            projectNameDraft="Story"
            isRenamingProject={false}
            editorMode={editorMode}
            isBusy={false}
            isDirty={false}
            isSaving={false}
            isExporting={false}
            engineMessage=""
            operationMessage=""
            projectFolderName="Story"
            language={language}
            isSettingsSaving={false}
            settingsSaveFailed={false}
            settingsRestartRequired={false}
            onCreateProject={() => {}}
            onOpenProject={() => {}}
            onSaveProject={() => {}}
            onExportGame={() => {}}
            onBeginRenameProject={() => {}}
            onProjectNameDraftChange={() => {}}
            onCommitProjectName={async () => true}
            onCancelProjectName={() => {}}
            onEditorModeChange={onEditorModeChange}
            onLanguageChange={async () => {}}
            onOpenSettings={() => {}}
          />
        </EditorI18nProvider>,
      );
    });
  }

  function modeButtons(): HTMLButtonElement[] {
    const group = container.querySelector('[role="group"]');
    if (!group) {
      throw new Error('missing editor mode group');
    }
    return [...group.querySelectorAll<HTMLButtonElement>('button')];
  }

  it('offers exactly Form, Blocks, and Code in English', async () => {
    const onEditorModeChange = vi.fn();
    await renderToolbar('en-US', 'code', onEditorModeChange);

    const buttons = modeButtons();
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Form editor',
      'Block editor',
      'Code',
    ]);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);

    await act(async () => {
      buttons[0]?.click();
      buttons[1]?.click();
      buttons[2]?.click();
    });
    expect(onEditorModeChange.mock.calls.map(([mode]) => mode)).toEqual([
      'form',
      'blocks',
      'code',
    ]);
  });

  it('localizes the third mode without changing its semantic value', async () => {
    const onEditorModeChange = vi.fn();
    await renderToolbar('zh-CN', 'form', onEditorModeChange);

    const codeButton = modeButtons()[2];
    expect(codeButton?.textContent?.trim()).toBe('代码');
    await act(async () => codeButton?.click());
    expect(onEditorModeChange).toHaveBeenCalledWith('code');
  });
});
