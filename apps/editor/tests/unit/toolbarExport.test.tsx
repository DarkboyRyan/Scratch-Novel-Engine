/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toolbar } from '../../src/renderer/components/Toolbar';
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
    } = {},
  ): void {
    root.render(
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
        onCreateProject={() => {}}
        onOpenProject={() => {}}
        onSaveProject={() => {}}
        onExportGame={options.onExportGame ?? (() => {})}
        onBeginRenameProject={() => {}}
        onProjectNameDraftChange={() => {}}
        onCommitProjectName={async () => true}
        onCancelProjectName={() => {}}
        onEditorModeChange={() => {}}
      />,
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
});
