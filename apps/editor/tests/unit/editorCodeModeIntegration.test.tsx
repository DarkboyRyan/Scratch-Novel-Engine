/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Form、Blockly 与 Code 三种投影在 App 中共享权威项目。
 * 测试覆盖：切 Code 前的草稿 flush、资源工作区边界、页面样式提交、场景与语言重投影。
 */

import { act, forwardRef, useImperativeHandle } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditorApplication } from '../../src/renderer/App';
import type * as EditorPlatformGatewayModule from '../../src/renderer/application/editorPlatformGateway';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import type { EditorLanguage } from '../../src/shared/editorSettingsProtocol';
import type {
  ProjectDocument,
  SceneDocument,
} from '../../src/shared/projectTypes';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
} from '../../src/shared/projectTypes';
import {
  CG_GALLERY_SCENE_ID,
  START_SCREEN_SCENE_ID,
} from '../../src/renderer/features/start-screen/startScreenScene';
import type * as StartScreenSceneModule from '../../src/renderer/features/start-screen/startScreenScene';

const appHooks = vi.hoisted(() => ({
  useEngineProject: vi.fn(),
  useFormEditor: vi.fn(),
  useGamePreview: vi.fn(),
}));

const modeProbes = vi.hoisted(() => ({
  flushBlockDraft: vi.fn<() => Promise<boolean>>(),
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
    editorSurfaceReducer: (
      current: ReturnType<typeof actual.initialEditorSurface>,
      action: Parameters<typeof actual.editorSurfaceReducer>[1],
    ) => action.type === 'project-loaded'
      ? current
      : actual.editorSurfaceReducer(current, action),
  };
});

vi.mock('../../src/renderer/components/Toolbar', () => ({
  Toolbar: ({
    editorMode,
    workspaceSection,
    onEditorModeChange,
    onWorkspaceSectionChange,
    onSaveProject,
    onOpenProject,
    projectNameDraft,
    isRenamingProject,
    onBeginRenameProject,
    onProjectNameDraftChange,
  }: {
    editorMode: 'form' | 'blocks' | 'code';
    workspaceSection: 'dialogue' | 'resources';
    onEditorModeChange: (mode: 'form' | 'blocks' | 'code') => void;
    onWorkspaceSectionChange: (
      section: 'dialogue' | 'resources',
    ) => void;
    onSaveProject: () => void;
    onOpenProject: () => void;
    projectNameDraft: string;
    isRenamingProject: boolean;
    onBeginRenameProject: () => void;
    onProjectNameDraftChange: (value: string) => void;
  }) => (
    <nav
      data-testid="mode-toolbar"
      data-mode={editorMode}
      data-section={workspaceSection}
    >
      <button
        type="button"
        onClick={() => onWorkspaceSectionChange('dialogue')}
      >
        Story
      </button>
      <button
        type="button"
        onClick={() => onWorkspaceSectionChange('resources')}
      >
        Resources
      </button>
      <button type="button" onClick={() => onEditorModeChange('form')}>
        Form
      </button>
      <button type="button" onClick={() => onEditorModeChange('blocks')}>
        Blocks
      </button>
      <button type="button" onClick={() => onEditorModeChange('code')}>
        Code
      </button>
      <button type="button" onClick={onSaveProject}>Save</button>
      <button type="button" onClick={onOpenProject}>Open</button>
      <button type="button" onClick={onBeginRenameProject}>Edit Project Name</button>
      {isRenamingProject && (
        <input
          aria-label="Project name draft"
          value={projectNameDraft}
          onChange={(event) => onProjectNameDraftChange(event.currentTarget.value)}
        />
      )}
    </nav>
  ),
}));

vi.mock('../../src/renderer/features/assets/AssetManager', () => ({
  AssetManager: ({
    onImportImage,
    onRenameAsset,
    onDeleteAssets,
  }: {
    onImportImage: () => Promise<void>;
    onRenameAsset: (assetId: string, displayName: string) => Promise<boolean>;
    onDeleteAssets: (assetIds: string[]) => Promise<boolean>;
  }) => (
    <main data-testid="asset-manager">
      <button type="button" onClick={() => void onImportImage()}>
        Import Image
      </button>
      <button
        type="button"
        onClick={() => void onRenameAsset('asset-1', 'Renamed.png')}
      >
        Rename Asset
      </button>
      <button
        type="button"
        onClick={() => void onDeleteAssets(['asset-1'])}
      >
        Delete Asset
      </button>
    </main>
  ),
}));

vi.mock('../../src/renderer/features/form-editor/FormEditor', () => ({
  FormEditor: () => <main data-testid="form-editor">Form editor</main>,
}));

vi.mock('../../src/renderer/features/start-screen/StartScreenFormEditor', () => ({
  StartScreenFormEditor: () => (
    <main data-testid="start-screen-form-editor">Title screen form</main>
  ),
}));

vi.mock('../../src/renderer/features/cg-gallery/CgGalleryFormEditor', () => ({
  CgGalleryFormEditor: () => (
    <main data-testid="cg-gallery-form-editor">CG gallery form</main>
  ),
}));

vi.mock('../../src/renderer/features/block-editor/BlockEditor', () => ({
  BlockEditor: forwardRef(function BlockEditorProbe(_props, ref) {
    useImperativeHandle(ref, () => ({
      flushPendingDraft: modeProbes.flushBlockDraft,
    }));
    return <main data-testid="block-editor">Block editor</main>;
  }),
}));

const firstScene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-one',
  name: 'Opening',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [
    {
      id: 'opening-dialogue',
      type: 'dialogue',
      speaker: 'Gregor',
      text: 'Before the change',
      voiceAssetId: null,
    },
  ],
};

const secondScene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-two',
  name: 'Hallway',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [
    {
      id: 'hallway-dialogue',
      type: 'dialogue',
      speaker: '',
      text: 'A knock came from the hallway.',
      voiceAssetId: null,
    },
  ],
};

function createProject(scenes: SceneDocument[]): ProjectDocument {
  return {
    schemaVersion: 1,
    id: 'three-mode-project',
    name: 'Three mode project',
    entrySceneId: firstScene.id,
    startScreen: {
      title: 'Three mode project',
      eyebrow: 'A VN ENGINE STORY',
      backgroundAssetId: null,
      musicAssetId: null,
      style: DEFAULT_START_SCREEN_STYLE,
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      style: DEFAULT_CG_GALLERY_STYLE,
    },
    scenes,
  };
}

describe('EditorApplication Code mode integration', () => {
  let container: HTMLDivElement;
  let root: Root;
  let project: ProjectDocument;
  let activeScene: SceneDocument;
  let commitFormDraft: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  let selectScene: ReturnType<
    typeof vi.fn<(sceneId: string) => Promise<void>>
  >;
  let updateStartScreenStyle: ReturnType<typeof vi.fn>;
  let updateCgGalleryStyle: ReturnType<typeof vi.fn>;
  let replaceSceneContent: ReturnType<typeof vi.fn>;
  let setEngineMessage: ReturnType<typeof vi.fn>;
  let strictSavePrepared: boolean | null;
  let openProject: ReturnType<typeof vi.fn>;
  let importImage: ReturnType<typeof vi.fn>;
  let renameProject: ReturnType<typeof vi.fn>;
  let renameAsset: ReturnType<typeof vi.fn>;
  let deleteAssets: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    project = createProject([firstScene, secondScene]);
    activeScene = firstScene;
    commitFormDraft = vi.fn(async () => true);
    selectScene = vi.fn(async () => {});
    updateStartScreenStyle = vi.fn().mockResolvedValue(true);
    updateCgGalleryStyle = vi.fn().mockResolvedValue(true);
    replaceSceneContent = vi.fn().mockResolvedValue(true);
    setEngineMessage = vi.fn();
    strictSavePrepared = null;
    openProject = vi.fn().mockResolvedValue('opened');
    importImage = vi.fn().mockResolvedValue(undefined);
    renameProject = vi.fn().mockResolvedValue(true);
    renameAsset = vi.fn().mockResolvedValue(true);
    deleteAssets = vi.fn().mockResolvedValue(true);
    modeProbes.flushBlockDraft.mockReset();
    modeProbes.flushBlockDraft.mockResolvedValue(true);

    appHooks.useEngineProject.mockReturnValue({
      projectGeneration: 1,
      assets: [],
      session: {
        hasStorage: true,
        projectFolderName: 'three-mode-project',
        revision: 1,
        savedRevision: 1,
        isDirty: false,
      },
      isBusy: false,
      isSaving: false,
      isExporting: false,
      exportMessage: '',
      projectFolderName: 'three-mode-project',
      saveProject: vi.fn(async (prepare?: () => Promise<boolean>) => {
        strictSavePrepared = await (prepare?.() ?? true);
        return strictSavePrepared;
      }),
      exportGame: vi.fn(),
      getProjectSnapshot: vi.fn().mockResolvedValue(project),
      setSceneBackground: vi.fn().mockResolvedValue(true),
      setEngineMessage,
      createProject: vi.fn(),
      openProject,
      renameProject,
      importImage,
      importAudio: vi.fn(),
      importVideo: vi.fn(),
      renameAsset,
      deleteAssets,
      updateStartScreenStyle,
      updateCgGalleryStyle,
      replaceSceneContent,
    });
    appHooks.useGamePreview.mockReturnValue({
      session: null,
      start: vi.fn(() => true),
      startWhole: vi.fn(() => true),
    });
    updateFormEditorHook();
    await renderApplication('zh-CN');
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  function updateFormEditorHook(): void {
    appHooks.useFormEditor.mockReturnValue({
      project,
      scene: activeScene,
      selectedNode: undefined,
      selectedBackground: undefined,
      selectedCharacter: undefined,
      selectedNodeId: null,
      selectedImageScaleDraft: '100',
      selectedImageScaleDraftInvalid: false,
      draftDirty: false,
      isBusy: false,
      engineMessage: '',
      commitPendingDraft: commitFormDraft,
      selectScene,
      addScene: vi.fn(),
      resetEditorState: vi.fn(),
    });
  }

  async function renderApplication(language: EditorLanguage): Promise<void> {
    await act(async () => {
      root.render(
        <EditorI18nProvider language={language}>
          <EditorApplication
            settings={{ settingsVersion: 1, language }}
            isSettingsSaving={false}
            settingsSaveFailed={false}
            settingsRestartRequired={false}
            onLanguageChange={async () => {}}
            onOpenSettings={() => {}}
          />
        </EditorI18nProvider>,
      );
    });
  }

  async function clickMode(label: 'Form' | 'Blocks' | 'Code'): Promise<void> {
    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === label,
    );
    if (!button) {
      throw new Error(`missing ${label} mode button`);
    }
    await act(async () => {
      button.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function clickButton(label: string): Promise<void> {
    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === label,
    );
    if (!button) {
      throw new Error(`missing ${label} button`);
    }
    await act(async () => {
      button.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  function mode(): string | undefined {
    return container.querySelector<HTMLElement>('[data-testid="mode-toolbar"]')
      ?.dataset.mode;
  }

  function section(): string | undefined {
    return container.querySelector<HTMLElement>('[data-testid="mode-toolbar"]')
      ?.dataset.section;
  }

  function codeSource(): string {
    const source = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label]',
    );
    if (!source) {
      throw new Error('missing Code source');
    }
    return source.value;
  }

  async function selectCodeScene(sceneId: string): Promise<void> {
    const sceneSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="选择当前场景"]',
    );
    if (!sceneSelect) {
      throw new Error('missing Code scene selector');
    }
    await act(async () => {
      sceneSelect.value = sceneId;
      sceneSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  it('flushes Form and Blockly before either view is replaced by Code', async () => {
    expect(mode()).toBe('form');
    await clickMode('Code');
    expect(commitFormDraft).toHaveBeenCalledOnce();
    expect(mode()).toBe('code');
    expect(container.querySelector('[data-testid="form-editor"]')).toBeNull();

    await clickMode('Form');
    expect(commitFormDraft).toHaveBeenCalledOnce();
    await clickMode('Blocks');
    expect(commitFormDraft).toHaveBeenCalledTimes(2);
    expect(mode()).toBe('blocks');

    await clickMode('Code');
    expect(modeProbes.flushBlockDraft).toHaveBeenCalledOnce();
    expect(mode()).toBe('code');
    expect(container.querySelector('[data-testid="block-editor"]')).toBeNull();
  });

  it('opens Assets as a separate workspace and restores the previous editor mode', async () => {
    expect(section()).toBe('dialogue');
    await clickMode('Blocks');
    expect(mode()).toBe('blocks');

    await clickButton('Resources');

    expect(modeProbes.flushBlockDraft).toHaveBeenCalledOnce();
    expect(section()).toBe('resources');
    expect(container.querySelector('[data-testid="asset-manager"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="block-editor"]')).toBeNull();

    await clickButton('Story');

    expect(section()).toBe('dialogue');
    expect(mode()).toBe('blocks');
    expect(container.querySelector('[data-testid="block-editor"]')).not.toBeNull();
  });

  it('keeps the current view mounted when its flush rejects the switch', async () => {
    commitFormDraft.mockResolvedValueOnce(false);
    await clickMode('Code');
    expect(mode()).toBe('form');
    expect(container.querySelector('[data-testid="form-editor"]')).not.toBeNull();

    await clickMode('Blocks');
    expect(mode()).toBe('blocks');
    modeProbes.flushBlockDraft.mockResolvedValueOnce(false);
    await clickMode('Code');
    expect(mode()).toBe('blocks');
    expect(container.querySelector('[data-testid="block-editor"]')).not.toBeNull();
  });

  it('does not enter Assets when the current Form draft cannot be committed', async () => {
    commitFormDraft.mockResolvedValueOnce(false);

    await clickButton('Resources');

    expect(section()).toBe('dialogue');
    expect(container.querySelector('[data-testid="form-editor"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="asset-manager"]')).toBeNull();
  });

  it('reprojects scene navigation, authoritative snapshots, and language in Code', async () => {
    await clickMode('Code');
    expect(codeSource()).toContain('Before the change');

    await selectCodeScene(secondScene.id);
    expect(selectScene).toHaveBeenCalledWith(secondScene.id);

    activeScene = secondScene;
    updateFormEditorHook();
    await renderApplication('zh-CN');
    expect(mode()).toBe('code');
    expect(codeSource()).toContain('A knock came from the hallway.');
    expect(codeSource()).not.toContain('Before the change');

    activeScene = {
      ...secondScene,
      nodes: [
        {
          id: 'hallway-dialogue',
          type: 'dialogue',
          speaker: '',
          text: 'The authoritative snapshot changed.',
          voiceAssetId: null,
        },
      ],
    };
    project = createProject([firstScene, activeScene]);
    updateFormEditorHook();
    await renderApplication('zh-CN');
    expect(codeSource()).toContain('The authoritative snapshot changed.');
    const sourceBeforeLanguageChange = codeSource();

    await renderApplication('en-US');
    expect(mode()).toBe('code');
    expect(container.querySelector('h1')?.textContent).toBe('Code');
    expect(codeSource()).toBe(sourceBeforeLanguageChange);
  });

  it('keeps Code on the selected title-screen and CG surfaces', async () => {
    await clickMode('Code');
    expect(codeSource()).toContain('Before the change');

    await selectCodeScene(START_SCREEN_SCENE_ID);
    expect(mode()).toBe('code');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toContain('main_screen(');
    expect(container.querySelector('pre[aria-label]')).toBeNull();

    await selectCodeScene(CG_GALLERY_SCENE_ID);
    expect(mode()).toBe('code');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toContain('cg_gallery(');

    await selectCodeScene(firstScene.id);
    expect(selectScene).toHaveBeenCalledWith(firstScene.id);
  });

  it('keeps invalid story code out of Form and restores it when Code reopens', async () => {
    await clickMode('Code');
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) {
      throw new Error('missing story Code editor');
    }
    const invalidSource = editor.value.replace('say(', 'unknown_command(');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(editor, invalidSource);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await clickMode('Form');
    expect(mode()).toBe('form');
    expect(container.querySelector('[data-testid="form-editor"]')).not.toBeNull();
    expect(replaceSceneContent).not.toHaveBeenCalled();

    await clickMode('Code');
    expect(mode()).toBe('code');
    expect(codeSource()).toBe(invalidSource);
    expect(container.querySelector('[aria-label="代码投影提示"]'))
      .not.toBeNull();
  });

  it('blocks strict save while an invalid Code draft is stored off-screen', async () => {
    await clickMode('Code');
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) {
      throw new Error('missing story Code editor');
    }
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(
        editor,
        editor.value.replace('say(', 'unknown_command('),
      );
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickMode('Form');

    await clickButton('Save');

    expect(strictSavePrepared).toBe(false);
    expect(replaceSceneContent).not.toHaveBeenCalled();
    expect(setEngineMessage).toHaveBeenCalledWith(
      expect.stringContaining('Code 草稿'),
    );
  });

  it('keeps invalid Code isolated while allowing an asset import', async () => {
    await clickMode('Code');
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) {
      throw new Error('missing story Code editor');
    }
    const invalidSource = editor.value.replace('say(', 'unknown_command(');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(editor, invalidSource);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await clickButton('Resources');
    expect(section()).toBe('resources');
    expect(replaceSceneContent).not.toHaveBeenCalled();

    await clickButton('Import Image');
    expect(importImage).toHaveBeenCalledOnce();

    await clickButton('Story');
    expect(mode()).toBe('code');
    expect(codeSource()).toBe(invalidSource);
  });

  it('blocks asset rename and delete while an invalid Code draft is stored', async () => {
    await clickMode('Code');
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) throw new Error('missing story Code editor');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(editor, editor.value.replace('say(', 'unknown_command('));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickButton('Resources');

    await clickButton('Rename Asset');
    await clickButton('Delete Asset');

    expect(renameAsset).not.toHaveBeenCalled();
    expect(deleteAssets).not.toHaveBeenCalled();
    expect(setEngineMessage).toHaveBeenCalledWith(
      expect.stringContaining('Code 草稿'),
    );
  });

  it('commits a toolbar project-name draft before mutating an asset', async () => {
    await clickButton('Resources');
    await clickButton('Edit Project Name');
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Project name draft"]',
    );
    if (!input) throw new Error('missing project-name draft');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(input, 'Renamed project');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await clickButton('Rename Asset');

    expect(renameProject).toHaveBeenCalledWith('Renamed project');
    expect(renameAsset).toHaveBeenCalledWith('asset-1', 'Renamed.png');
    expect(renameProject.mock.invocationCallOrder[0])
      .toBeLessThan(renameAsset.mock.invocationCallOrder[0]!);
  });

  it('returns to Story Form after another project opens', async () => {
    await clickMode('Blocks');
    await clickButton('Resources');
    expect(section()).toBe('resources');

    await clickButton('Open');

    expect(openProject).toHaveBeenCalledOnce();
    expect(section()).toBe('dialogue');
    expect(mode()).toBe('form');
    expect(container.querySelector('[data-testid="form-editor"]')).not.toBeNull();
  });

  it('discards session-only Code drafts after another project opens successfully', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await clickMode('Code');
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) {
      throw new Error('missing story Code editor');
    }
    const invalidSource = editor.value.replace('say(', 'unknown_command(');
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(editor, invalidSource);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickMode('Form');

    await clickButton('Open');
    expect(openProject).toHaveBeenCalledOnce();
    await clickMode('Code');
    expect(codeSource()).not.toBe(invalidSource);
    expect(codeSource()).toContain('Before the change');
    confirm.mockRestore();
  });

  it('applies a valid title style before navigating to the CG Code surface', async () => {
    await clickMode('Code');
    await selectCodeScene(START_SCREEN_SCENE_ID);
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) {
      throw new Error('missing title-screen style editor');
    }
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(
        editor,
        editor.value.replace('layout: split-right', 'layout: center'),
      );
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await selectCodeScene(CG_GALLERY_SCENE_ID);

    expect(updateStartScreenStyle).toHaveBeenCalledOnce();
    expect(updateStartScreenStyle).toHaveBeenCalledWith({
      ...DEFAULT_START_SCREEN_STYLE,
      layout: 'center',
    });
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toContain('cg_gallery(');
    expect(updateCgGalleryStyle).not.toHaveBeenCalled();
  });

  it('keeps an invalid style draft isolated while allowing page navigation', async () => {
    await clickMode('Code');
    await selectCodeScene(START_SCREEN_SCENE_ID);
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) {
      throw new Error('missing title-screen style editor');
    }
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(
        editor,
        editor.value.replace('radius: 0', 'radius: 99'),
      );
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await selectCodeScene(CG_GALLERY_SCENE_ID);

    expect(mode()).toBe('code');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toContain('cg_gallery(');
    expect(updateStartScreenStyle).not.toHaveBeenCalled();

    await selectCodeScene(START_SCREEN_SCENE_ID);
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toContain('main_screen(');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toContain('radius: 99');
  });
});
