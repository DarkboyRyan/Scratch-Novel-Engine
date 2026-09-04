/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Toolbar 对表单、图形化和只读代码三种视图的入口。
 * 测试覆盖：顶层工作区、三个编辑模式、本地化标签、选中态与回调。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorMode } from '../../src/renderer/application/editorMode';
import type { WorkspaceSection } from '../../src/renderer/application/editorSection';
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
    workspaceSection: WorkspaceSection = 'dialogue',
    onWorkspaceSectionChange: (section: WorkspaceSection) => void = () => {},
    isRenamingProject = false,
  ): Promise<void> {
    await act(async () => {
      root.render(
        <EditorI18nProvider language={language}>
          <Toolbar
            projectName="Story"
            projectNameDraft="Story"
            isRenamingProject={isRenamingProject}
            editorMode={editorMode}
            workspaceSection={workspaceSection}
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
            onWorkspaceSectionChange={onWorkspaceSectionChange}
            onEditorModeChange={onEditorModeChange}
            onLanguageChange={async () => {}}
            onOpenSettings={() => {}}
          />
        </EditorI18nProvider>,
      );
    });
  }

  function modeButtons(): HTMLButtonElement[] {
    const group = container.querySelector(
      '[data-toolbar-switch="editor-mode"]',
    );
    if (!group) {
      throw new Error('missing editor mode group');
    }
    return [...group.querySelectorAll<HTMLButtonElement>('button')];
  }

  function workspaceButtons(): HTMLButtonElement[] {
    const group = container.querySelector(
      '[data-toolbar-switch="workspace"]',
    );
    if (!group) {
      throw new Error('missing workspace group');
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

  it('keeps Assets separate from the three editor modes', async () => {
    const onEditorModeChange = vi.fn();
    const onWorkspaceSectionChange = vi.fn();
    await renderToolbar(
      'en-US',
      'blocks',
      onEditorModeChange,
      'resources',
      onWorkspaceSectionChange,
    );

    const buttons = workspaceButtons();
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Story Flow',
      'Asset Manager',
    ]);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ]);
    expect(modeButtons()).toHaveLength(3);
    expect(modeButtons().every((button) => button.disabled)).toBe(true);

    await act(async () => buttons[0]?.click());
    expect(onWorkspaceSectionChange).toHaveBeenCalledWith('dialogue');
    expect(onEditorModeChange).not.toHaveBeenCalled();
  });

  it('does not let project-name blur swallow workspace or mode pointer clicks', async () => {
    const onWorkspaceSectionChange = vi.fn();
    const onEditorModeChange = vi.fn();
    await renderToolbar(
      'en-US',
      'form',
      onEditorModeChange,
      'dialogue',
      onWorkspaceSectionChange,
      true,
    );
    const resourceButton = workspaceButtons()[1];
    if (!resourceButton) throw new Error('missing resource workspace button');

    const pointerDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      resourceButton.dispatchEvent(pointerDown);
      resourceButton.click();
    });

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onWorkspaceSectionChange).toHaveBeenCalledOnce();
    expect(onWorkspaceSectionChange).toHaveBeenCalledWith('resources');

    const blocksButton = modeButtons()[1];
    if (!blocksButton) throw new Error('missing Block editor mode button');
    const modePointerDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      blocksButton.dispatchEvent(modePointerDown);
      blocksButton.click();
    });

    expect(modePointerDown.defaultPrevented).toBe(true);
    expect(onEditorModeChange).toHaveBeenCalledOnce();
    expect(onEditorModeChange).toHaveBeenCalledWith('blocks');
  });
});
