/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证资源栏中的场景初始背景缩放入口。
 * 测试覆盖：缩放保留、清空归一化、标题页隐藏缩放控件。
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditorApplication } from '../../src/renderer/App';
import type * as EditorPlatformGatewayModule from '../../src/renderer/application/editorPlatformGateway';
import { ResourcePanel } from '../../src/renderer/features/assets/ResourcePanel';
import type * as StartScreenSceneModule from '../../src/renderer/features/start-screen/startScreenScene';

const appHooks = vi.hoisted(() => ({
  useEngineProject: vi.fn(),
  useFormEditor: vi.fn(),
  useGamePreview: vi.fn(),
}));

vi.mock('../../src/renderer/hooks/useEngineProject', () => ({
  useEngineProject: appHooks.useEngineProject,
}));

vi.mock('../../src/renderer/features/form-editor/useFormEditor', () => ({
  useFormEditor: appHooks.useFormEditor,
}));

vi.mock('../../src/renderer/features/game-preview/useGamePreview', () => ({
  useGamePreview: appHooks.useGamePreview,
}));

vi.mock('../../src/renderer/features/assets/useAssetPreviewUrls', () => ({
  useAssetPreviewUrls: () => ({}),
}));

vi.mock('../../src/renderer/application/editorPlatformGateway', async (
  importOriginal,
) => {
  const actual = await importOriginal<typeof EditorPlatformGatewayModule>();
  return {
    ...actual,
    subscribeEditorProjectFileCommands: () => () => {},
  };
});

vi.mock('../../src/renderer/features/start-screen/startScreenScene', async (
  importOriginal,
) => {
  const actual = await importOriginal<typeof StartScreenSceneModule>();
  return {
    ...actual,
    initialEditorSurface: () => 'story',
    editorSurfaceReducer: () => 'story',
  };
});

vi.mock('../../src/renderer/components/Toolbar', () => ({
  Toolbar: ({
    isDirty,
    onSaveProject,
  }: {
    isDirty: boolean;
    onSaveProject: () => void;
  }) => (
    <button
      type="button"
      data-testid="save-project"
      data-dirty={String(isDirty)}
      onClick={onSaveProject}
    >
      Save
    </button>
  ),
}));

vi.mock('../../src/renderer/features/form-editor/FormEditor', async () => {
  const { SceneBackgroundSettings } = await import(
    '../../src/renderer/features/assets/SceneBackgroundSettings'
  );
  return {
  FormEditor: ({
    assets,
    backgroundAssetId,
    sceneBackgroundScalePercent,
    sceneBackgroundScaleDraft,
    sceneBackgroundScaleDraftInvalid,
    onSceneBackgroundScaleDraftChange,
    onCommitSceneBackgroundScaleDraft,
    onSelectSceneBackground,
    backgroundScalePercent,
    characters,
    onStartPreview,
    onSelectScene,
    onAddScene,
  }: {
    assets: Array<{
      id: string;
      type: 'image' | 'audio' | 'video';
      displayName: string;
    }>;
    backgroundAssetId: string | null;
    sceneBackgroundScalePercent: number;
    sceneBackgroundScaleDraft: string;
    sceneBackgroundScaleDraftInvalid: boolean;
    onSceneBackgroundScaleDraftChange: (value: string) => void;
    onCommitSceneBackgroundScaleDraft: () => Promise<boolean>;
    onSelectSceneBackground: (next: {
      assetId: string | null;
      scalePercent: number;
    }) => Promise<void>;
    backgroundScalePercent: number;
    characters: Array<{ scalePercent: number }>;
    onStartPreview: () => void;
    onSelectScene: (sceneId: string) => Promise<void>;
    onAddScene: () => Promise<void>;
  }) => (
    <>
      <SceneBackgroundSettings
        assets={assets}
        backgroundAssetId={backgroundAssetId}
        backgroundScalePercent={sceneBackgroundScalePercent}
        backgroundScaleDraft={sceneBackgroundScaleDraft}
        backgroundScaleDraftInvalid={sceneBackgroundScaleDraftInvalid}
        isBusy={false}
        onBackgroundScaleDraftChange={
          onSceneBackgroundScaleDraftChange
        }
        onCommitBackgroundScaleDraft={
          onCommitSceneBackgroundScaleDraft
        }
        onSelectBackground={onSelectSceneBackground}
      />
      <output
        data-testid="static-preview-scale"
        data-background-scale={String(backgroundScalePercent)}
        data-character-scales={characters
          .map((character) => character.scalePercent)
          .join(',')}
      />
      <button type="button" data-testid="start-preview" onClick={onStartPreview}>
        Preview
      </button>
      <button
        type="button"
        data-testid="select-scene-2"
        onClick={() => void onSelectScene('scene-2')}
      >
        Scene 2
      </button>
      <button
        type="button"
        data-testid="add-scene"
        onClick={() => void onAddScene()}
      >
        Add scene
      </button>
    </>
  ),
  };
});

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setNativeSelectValue(select: HTMLSelectElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('scene initial background scale', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onSelectBackground = vi.fn().mockResolvedValue(undefined);
  const onBackgroundScaleDraftChange = vi.fn();
  const onCommitBackgroundScaleDraft = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onSelectBackground.mockClear();
    onBackgroundScaleDraftChange.mockClear();
    onCommitBackgroundScaleDraft.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderPanel(
    backgroundAssetId: string | null,
    backgroundScalePercent: number,
    supportsBackgroundScale = true,
    backgroundScaleDraft = String(backgroundScalePercent),
    backgroundScaleDraftInvalid = false,
  ) {
    await act(async () => {
      root.render(
        <ResourcePanel
          assets={[{ id: 'image-1', type: 'image', displayName: 'Room' }]}
          backgroundAssetId={backgroundAssetId}
          backgroundScalePercent={backgroundScalePercent}
          backgroundScaleDraft={backgroundScaleDraft}
          backgroundScaleDraftInvalid={backgroundScaleDraftInvalid}
          supportsBackgroundScale={supportsBackgroundScale}
          previewUrls={{}}
          isBusy={false}
          onImportImage={vi.fn()}
          onImportAudio={vi.fn()}
          onImportVideo={vi.fn()}
          onBackgroundScaleDraftChange={onBackgroundScaleDraftChange}
          onCommitBackgroundScaleDraft={onCommitBackgroundScaleDraft}
          onSelectBackground={onSelectBackground}
        />,
      );
    });
  }

  it('keeps a focused valid scale as a controlled draft and commits it on blur', async () => {
    await renderPanel('image-1', 140);
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="背景缩放百分比"]',
    );
    expect(input?.value).toBe('140');

    await act(async () => {
      if (!input) throw new Error('missing background scale input');
      setNativeInputValue(input, '175');
    });
    expect(onBackgroundScaleDraftChange).toHaveBeenCalledWith('175');

    await renderPanel('image-1', 140, true, '175');
    const updatedInput = container.querySelector<HTMLInputElement>(
      '[aria-label="背景缩放百分比"]',
    );
    await act(async () => {
      if (!updatedInput) throw new Error('missing updated scale input');
      updatedInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onCommitBackgroundScaleDraft).toHaveBeenCalledOnce();
    expect(onSelectBackground).not.toHaveBeenCalled();
  });

  it('uses 100 for a newly selected image and when clearing', async () => {
    await renderPanel(null, 100);
    const imageButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Room'),
    );
    await act(async () => imageButton?.click());
    expect(onSelectBackground).toHaveBeenLastCalledWith({
      assetId: 'image-1',
      scalePercent: 100,
    });

    await renderPanel('image-1', 180);
    const clearButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '无背景',
    );
    await act(async () => clearButton?.click());
    expect(onSelectBackground).toHaveBeenLastCalledWith({
      assetId: null,
      scalePercent: 100,
    });
  });

  it('does not expose scene scaling on the title-screen resource surface', async () => {
    await renderPanel('image-1', 100, false);
    expect(
      container.querySelector('[aria-label="背景缩放百分比"]'),
    ).toBeNull();
  });

  it('keeps the latest focused scale when another background is clicked', async () => {
    await act(async () => {
      root.render(
        <ResourcePanel
          assets={[
            { id: 'image-1', type: 'image', displayName: 'Room' },
            { id: 'image-2', type: 'image', displayName: 'Street' },
          ]}
          backgroundAssetId="image-1"
          backgroundScalePercent={140}
          backgroundScaleDraft="175"
          backgroundScaleDraftInvalid={false}
          supportsBackgroundScale
          previewUrls={{}}
          isBusy={false}
          onImportImage={vi.fn()}
          onImportAudio={vi.fn()}
          onImportVideo={vi.fn()}
          onBackgroundScaleDraftChange={onBackgroundScaleDraftChange}
          onCommitBackgroundScaleDraft={onCommitBackgroundScaleDraft}
          onSelectBackground={onSelectBackground}
        />,
      );
    });
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="背景缩放百分比"]',
    );
    const streetButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Street'),
    );
    if (!input || !streetButton) throw new Error('missing background controls');

    await act(async () => {
      input.focus();
      input.dispatchEvent(new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: streetButton,
      }));
      streetButton.click();
      await Promise.resolve();
    });

    expect(onCommitBackgroundScaleDraft).not.toHaveBeenCalled();
    expect(onSelectBackground).toHaveBeenCalledWith({
      assetId: 'image-2',
      scalePercent: 175,
    });
  });

  it('marks an invalid focused draft without replacing its raw value', async () => {
    await renderPanel('image-1', 140, true, '301', true);
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="背景缩放百分比"]',
    );

    expect(input?.value).toBe('301');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('10');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('300');
  });
});

describe('scene initial background scale draft boundaries', () => {
  const project = {
    schemaVersion: 1 as const,
    id: 'background-draft-project',
    name: 'Background draft project',
    entrySceneId: 'scene-1',
    startScreen: {
      title: 'Background draft project',
      eyebrow: 'A VN ENGINE STORY',
      backgroundAssetId: null,
      musicAssetId: null,
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
    },
    scenes: [
      {
        schemaVersion: 1 as const,
        id: 'scene-1',
        name: 'Scene 1',
        backgroundAssetId: 'image-1',
        backgroundScalePercent: 140,
        nodes: [],
      },
      {
        schemaVersion: 1 as const,
        id: 'scene-2',
        name: 'Scene 2',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [],
      },
    ],
  };
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let diskSaveCount: number;
  let setSceneBackground: ReturnType<typeof vi.fn>;
  let saveProject: ReturnType<typeof vi.fn>;
  let getProjectSnapshot: ReturnType<typeof vi.fn>;
  let commitPendingDraft: ReturnType<typeof vi.fn>;
  let selectScene: ReturnType<typeof vi.fn>;
  let addScene: ReturnType<typeof vi.fn>;
  let startPreview: ReturnType<typeof vi.fn>;
  let formEditorState: Record<string, unknown>;

  function waitForMacrotask(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    setNativeInputValue(input, value);
  }

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    diskSaveCount = 0;
    setSceneBackground = vi.fn().mockResolvedValue(true);
    getProjectSnapshot = vi.fn().mockResolvedValue(project);
    commitPendingDraft = vi.fn().mockResolvedValue(true);
    selectScene = vi.fn().mockResolvedValue(undefined);
    addScene = vi.fn().mockResolvedValue(undefined);
    startPreview = vi.fn(() => true);
    saveProject = vi.fn(async (prepare: () => Promise<boolean>) => {
      if (await prepare()) {
        diskSaveCount += 1;
      }
    });

    appHooks.useEngineProject.mockReturnValue({
      projectGeneration: 1,
      assets: [
        { id: 'image-1', type: 'image', displayName: 'Room' },
        { id: 'image-2', type: 'image', displayName: 'Street' },
      ],
      session: {
        hasStorage: true,
        projectFolderName: 'background-draft-project',
        revision: 1,
        savedRevision: 1,
        isDirty: false,
      },
      isBusy: false,
      isSaving: false,
      isExporting: false,
      exportMessage: '',
      projectFolderName: 'background-draft-project',
      saveProject,
      exportGame: vi.fn(),
      getProjectSnapshot,
      setSceneBackground,
      setEngineMessage: vi.fn(),
      createProject: vi.fn(),
      openProject: vi.fn(),
      renameProject: vi.fn(),
      importImage: vi.fn(),
      importAudio: vi.fn(),
      importVideo: vi.fn(),
    });
    formEditorState = {
      project,
      scene: project.scenes[0],
      selectedNode: undefined,
      selectedBackground: undefined,
      selectedCharacter: undefined,
      selectedNodeId: null,
      selectedImageScaleDraft: '100',
      selectedImageScaleDraftInvalid: false,
      draftDirty: false,
      isBusy: false,
      engineMessage: '',
      commitPendingDraft,
      selectScene,
      addScene,
      resetEditorState: vi.fn(),
    };
    appHooks.useFormEditor.mockReturnValue(formEditorState);
    appHooks.useGamePreview.mockReturnValue({
      session: null,
      start: startPreview,
      startWhole: vi.fn(() => true),
    });

    await act(async () => {
      root.render(
        <EditorApplication
          settings={{ settingsVersion: 1, language: 'zh-CN' }}
          isSettingsSaving={false}
          settingsSaveFailed={false}
          settingsRestartRequired={false}
          onLanguageChange={async () => {}}
          onOpenSettings={() => {}}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  function backgroundScaleInput(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="背景缩放百分比"]',
    );
    if (!input) throw new Error('missing background scale input');
    return input;
  }

  function backgroundSelect(): HTMLSelectElement {
    const select = container.querySelector<HTMLSelectElement>(
      '.scene-background-select',
    );
    if (!select) throw new Error('missing background select');
    return select;
  }

  async function enterFocusedScale(value: string): Promise<void> {
    const input = backgroundScaleInput();
    await act(async () => {
      input.focus();
      setInputValue(input, value);
    });
    expect(document.activeElement).toBe(input);
    expect(backgroundScaleInput().value).toBe(value);
  }

  async function clickTestButton(testId: string): Promise<void> {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-testid="${testId}"]`,
    );
    if (!button) throw new Error(`missing ${testId} button`);
    await act(async () => {
      button.click();
      await waitForMacrotask();
    });
  }

  function staticPreview(): HTMLOutputElement {
    const output = container.querySelector<HTMLOutputElement>(
      '[data-testid="static-preview-scale"]',
    );
    if (!output) throw new Error('missing static preview probe');
    return output;
  }

  async function rerenderApplication(): Promise<void> {
    await act(async () => {
      root.render(
        <EditorApplication
          settings={{ settingsVersion: 1, language: 'zh-CN' }}
          isSettingsSaving={false}
          settingsSaveFailed={false}
          settingsRestartRequired={false}
          onLanguageChange={async () => {}}
          onOpenSettings={() => {}}
        />,
      );
    });
  }

  it('projects only a valid initial-background draft into the static preview', async () => {
    expect(staticPreview().dataset.backgroundScale).toBe('140');

    await enterFocusedScale('175');
    expect(staticPreview().dataset.backgroundScale).toBe('175');
    expect(setSceneBackground).not.toHaveBeenCalled();

    await enterFocusedScale('301');
    expect(staticPreview().dataset.backgroundScale).toBe('140');
    expect(setSceneBackground).not.toHaveBeenCalled();
  });

  it('projects valid selected background and portrait drafts without mutating the engine', async () => {
    const backgroundNode = {
      id: 'timeline-background',
      type: 'background' as const,
      assetId: 'image-2',
      scalePercent: 120,
    };
    const characterNode = {
      id: 'timeline-character',
      type: 'character' as const,
      mode: 'show' as const,
      assetId: 'image-1',
      slot: 'left' as const,
      layer: 1,
      position: null,
      effect: null,
      scalePercent: 135,
    };
    const previewScene = {
      ...project.scenes[0],
      nodes: [backgroundNode, characterNode],
    };
    const previewProject = {
      ...project,
      scenes: [previewScene, project.scenes[1]],
    };

    formEditorState = {
      ...formEditorState,
      project: previewProject,
      scene: previewScene,
      selectedNode: backgroundNode,
      selectedBackground: backgroundNode,
      selectedCharacter: undefined,
      selectedNodeId: backgroundNode.id,
      selectedImageScaleDraft: '175',
      selectedImageScaleDraftInvalid: false,
    };
    appHooks.useFormEditor.mockReturnValue(formEditorState);
    await rerenderApplication();
    expect(staticPreview().dataset.backgroundScale).toBe('175');
    expect(setSceneBackground).not.toHaveBeenCalled();

    formEditorState = {
      ...formEditorState,
      selectedNode: characterNode,
      selectedBackground: undefined,
      selectedCharacter: characterNode,
      selectedNodeId: characterNode.id,
      selectedImageScaleDraft: '180',
      selectedImageScaleDraftInvalid: false,
    };
    appHooks.useFormEditor.mockReturnValue(formEditorState);
    await rerenderApplication();
    expect(staticPreview().dataset.characterScales).toBe('180');
    expect(setSceneBackground).not.toHaveBeenCalled();

    formEditorState = {
      ...formEditorState,
      selectedImageScaleDraft: '301',
      selectedImageScaleDraftInvalid: true,
    };
    appHooks.useFormEditor.mockReturnValue(formEditorState);
    await rerenderApplication();
    expect(staticPreview().dataset.characterScales).toBe('135');
    expect(setSceneBackground).not.toHaveBeenCalled();
  });

  it('flushes the still-focused draft before save, preview, and scene navigation', async () => {
    await enterFocusedScale('171');
    await clickTestButton('save-project');
    expect(setSceneBackground).toHaveBeenLastCalledWith(
      'scene-1',
      'image-1',
      171,
    );
    expect(diskSaveCount).toBe(1);

    await enterFocusedScale('172');
    await clickTestButton('start-preview');
    expect(setSceneBackground).toHaveBeenLastCalledWith(
      'scene-1',
      'image-1',
      172,
    );
    expect(getProjectSnapshot).toHaveBeenCalled();
    expect(startPreview).toHaveBeenCalled();

    await enterFocusedScale('173');
    await clickTestButton('select-scene-2');
    expect(setSceneBackground).toHaveBeenLastCalledWith(
      'scene-1',
      'image-1',
      173,
    );
    expect(selectScene).toHaveBeenCalledWith('scene-2');
    expect(setSceneBackground.mock.invocationCallOrder.at(-1)).toBeLessThan(
      selectScene.mock.invocationCallOrder[0] ?? 0,
    );

    await enterFocusedScale('174');
    await clickTestButton('add-scene');
    expect(setSceneBackground).toHaveBeenLastCalledWith(
      'scene-1',
      'image-1',
      174,
    );
    expect(addScene).toHaveBeenCalledOnce();
  });

  it('keeps a failed focused draft visible and dirty instead of saving it', async () => {
    setSceneBackground.mockResolvedValue(false);
    await enterFocusedScale('175');
    await clickTestButton('save-project');

    expect(setSceneBackground).toHaveBeenCalledWith(
      'scene-1',
      'image-1',
      175,
    );
    expect(diskSaveCount).toBe(0);
    expect(backgroundScaleInput().value).toBe('175');
    expect(
      container.querySelector('[data-testid="save-project"]')?.getAttribute(
        'data-dirty',
      ),
    ).toBe('true');
  });

  it('applies the latest focused scale when a different resource is selected', async () => {
    await enterFocusedScale('175');
    const select = backgroundSelect();
    await act(async () => {
      backgroundScaleInput().dispatchEvent(new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: select,
      }));
      setNativeSelectValue(select, 'image-2');
      await waitForMacrotask();
    });

    expect(setSceneBackground).toHaveBeenCalledOnce();
    expect(setSceneBackground).toHaveBeenCalledWith(
      'scene-1',
      'image-2',
      175,
    );
  });

  it('preserves the scale draft when the atomic background replacement fails', async () => {
    setSceneBackground.mockResolvedValue(false);
    await enterFocusedScale('176');
    const select = backgroundSelect();
    await act(async () => {
      backgroundScaleInput().dispatchEvent(new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: select,
      }));
      setNativeSelectValue(select, 'image-2');
      await waitForMacrotask();
    });

    expect(setSceneBackground).toHaveBeenCalledOnce();
    expect(setSceneBackground).toHaveBeenCalledWith(
      'scene-1',
      'image-2',
      176,
    );
    expect(backgroundScaleInput().value).toBe('176');
    expect(
      container.querySelector('[data-testid="save-project"]')?.getAttribute(
        'data-dirty',
      ),
    ).toBe('true');
  });

  it('keeps an invalid focused draft and blocks save, preview, and navigation', async () => {
    await enterFocusedScale('301');
    await clickTestButton('save-project');
    await clickTestButton('start-preview');
    await clickTestButton('select-scene-2');
    await clickTestButton('add-scene');
    const select = backgroundSelect();
    await act(async () => {
      setNativeSelectValue(select, 'image-2');
      await waitForMacrotask();
    });

    expect(setSceneBackground).not.toHaveBeenCalled();
    expect(diskSaveCount).toBe(0);
    expect(startPreview).not.toHaveBeenCalled();
    expect(selectScene).not.toHaveBeenCalled();
    expect(addScene).not.toHaveBeenCalled();
    expect(backgroundScaleInput().value).toBe('301');
    expect(backgroundScaleInput().getAttribute('aria-invalid')).toBe('true');
  });
});
