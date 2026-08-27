/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 start screen Editor projection 的行为。
 * 测试覆盖：`start screen Editor projection`。
 */

import * as Blockly from 'blockly';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  StartScreenEditor,
  type StartScreenEditorHandle,
} from '../../src/renderer/features/start-screen/StartScreenEditor';
import { StartScreenFormEditor } from '../../src/renderer/features/start-screen/StartScreenFormEditor';
import { getStartScreenFieldUpdate } from '../../src/renderer/features/start-screen/startScreenBlockEvents';
import {
  createStartScreenBackgroundOptions,
  createStartScreenMusicOptions,
  renderStartScreenBlocks,
  resolveStartScreenAssetLabels,
  START_SCREEN_BACKGROUND_BLOCK_TYPE,
  START_SCREEN_BLOCK_FIELDS,
  START_SCREEN_BLOCK_IDS,
  START_SCREEN_MUSIC_BLOCK_TYPE,
  START_SCREEN_ROOT_BLOCK_TYPE,
} from '../../src/renderer/features/start-screen/startScreenBlocks';
import {
  CG_GALLERY_SCENE_ID,
  createEditorSceneOptions,
  editorSurfaceReducer,
  initialEditorSurface,
  START_SCREEN_SCENE_ID,
  updateStartScreenFromLatest,
} from '../../src/renderer/features/start-screen/startScreenScene';
import type {
  AssetDocument,
  ProjectDocument,
} from '../../src/shared/projectTypes';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'start-screen-editor-project',
  name: 'Start screen editor',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Start screen title',
    backgroundAssetId: null,
    musicAssetId: 'music-1',
  },
  cgGallery: {
    pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
  },
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-1',
      name: '场景 1',
      backgroundAssetId: null,
      nodes: [],
    },
    {
      schemaVersion: 1,
      id: 'scene-2',
      name: '天台',
      backgroundAssetId: null,
      nodes: [],
    },
  ],
};

const assets: AssetDocument[] = [
  { id: 'background-1', type: 'image', displayName: '夜空.png' },
  { id: 'music-1', type: 'audio', displayName: '主题曲.ogg' },
  { id: 'video-1', type: 'video', displayName: '片头.mp4' },
];

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function pressInputKey(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true }),
  );
}

describe('start screen Editor projection', () => {
  it('defaults to the main menu and resets there whenever a project loads', () => {
    expect(initialEditorSurface()).toBe('start-screen');
    expect(
      editorSurfaceReducer('story', { type: 'project-loaded' }),
    ).toBe('start-screen');
    expect(
      editorSurfaceReducer('start-screen', { type: 'select-story' }),
    ).toBe('story');
    expect(
      editorSurfaceReducer('story', { type: 'select-start-screen' }),
    ).toBe('start-screen');
  });

  it('places the synthetic main menu before story scenes without mutating them', () => {
    const storySceneIds = project.scenes.map((scene) => scene.id);

    expect(createEditorSceneOptions(project)).toEqual([
      {
        id: START_SCREEN_SCENE_ID,
        label: '主界面',
        kind: 'start-screen',
      },
      {
        id: CG_GALLERY_SCENE_ID,
        label: 'CG 画廊',
        kind: 'cg-gallery',
      },
      { id: 'scene-1', label: '场景 1', kind: 'story' },
      { id: 'scene-2', label: '场景 2 · 天台', kind: 'story' },
    ]);
    expect(project.scenes.map((scene) => scene.id)).toEqual(storySceneIds);
    expect(project.scenes).toHaveLength(2);
  });

  it('preserves music committed while a background click waits for pending edits', async () => {
    let finishPreparation: (prepared: boolean) => void = () => {};
    const preparation = new Promise<boolean>((resolve) => {
      finishPreparation = resolve;
    });
    let latestProject: Pick<ProjectDocument, 'startScreen'> = {
      startScreen: {
        title: '旧标题',
        backgroundAssetId: null,
        musicAssetId: null,
      },
    };
    const updateStartScreen = vi.fn().mockResolvedValue(true);

    const update = updateStartScreenFromLatest(
      { backgroundAssetId: 'background-1' },
      () => preparation,
      async () => latestProject,
      updateStartScreen,
    );

    latestProject = {
      startScreen: {
        title: '刚提交的标题',
        backgroundAssetId: null,
        musicAssetId: 'music-just-committed',
      },
    };
    finishPreparation(true);

    await expect(update).resolves.toBe(true);
    expect(updateStartScreen).toHaveBeenCalledWith(
      '刚提交的标题',
      'background-1',
      'music-just-committed',
    );
  });

  it('renders a fixed block chain with editable, type-safe asset dropdowns', () => {
    const workspace = new Blockly.Workspace();
    renderStartScreenBlocks(workspace, project.startScreen, assets);
    const root = workspace.getBlockById(START_SCREEN_BLOCK_IDS.root);
    const background = workspace.getBlockById(
      START_SCREEN_BLOCK_IDS.background,
    );
    const music = workspace.getBlockById(START_SCREEN_BLOCK_IDS.music);

    expect(root?.type).toBe(START_SCREEN_ROOT_BLOCK_TYPE);
    expect(background?.type).toBe(START_SCREEN_BACKGROUND_BLOCK_TYPE);
    expect(music?.type).toBe(START_SCREEN_MUSIC_BLOCK_TYPE);
    expect(root?.getInputTargetBlock('CONTENTS')).toBe(background);
    expect(background?.getNextBlock()).toBe(music);
    for (const block of [root, background, music]) {
      expect(block?.isMovable()).toBe(false);
      expect(block?.isDeletable()).toBe(false);
    }
    expect(root?.isEditable()).toBe(true);
    expect(background?.isEditable()).toBe(true);
    expect(music?.isEditable()).toBe(true);
    expect(root?.getField(START_SCREEN_BLOCK_FIELDS.title)).toBeInstanceOf(
      Blockly.FieldTextInput,
    );
    expect(
      root?.getFieldValue(START_SCREEN_BLOCK_FIELDS.title),
    ).toBe('Start screen title');

    const backgroundField = background?.getField(
      START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
    );
    const musicField = music?.getField(
      START_SCREEN_BLOCK_FIELDS.musicAssetId,
    );
    expect(backgroundField).toBeInstanceOf(Blockly.FieldDropdown);
    expect(musicField).toBeInstanceOf(Blockly.FieldDropdown);
    expect(
      (backgroundField as Blockly.FieldDropdown).getOptions(false),
    ).toEqual([
      ['无', ''],
      ['夜空.png', 'background-1'],
    ]);
    expect(
      (musicField as Blockly.FieldDropdown).getOptions(false),
    ).toEqual([
      ['无', ''],
      ['主题曲.ogg', 'music-1'],
    ]);
    expect(
      background?.getFieldValue(
        START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
      ),
    ).toBe('');
    expect(
      music?.getFieldValue(START_SCREEN_BLOCK_FIELDS.musicAssetId),
    ).toBe('music-1');

    workspace.dispose();
  });

  it('keeps missing selections reachable and always places “无” first', () => {
    expect(
      resolveStartScreenAssetLabels(
        {
          title: '主界面标题',
          backgroundAssetId: 'missing-image',
          musicAssetId: 'music-1',
        },
        [{ id: 'music-1', type: 'audio', displayName: '主题曲' }],
      ),
    ).toEqual({
      background: '缺失图片（missing-image）',
      music: '主题曲',
    });

    const missingStartScreen = {
      title: '主界面标题',
      backgroundAssetId: 'missing-image',
      musicAssetId: 'missing-audio',
    };
    expect(
      createStartScreenBackgroundOptions(missingStartScreen, assets),
    ).toEqual([
      ['无', ''],
      ['夜空.png', 'background-1'],
      ['缺失图片（missing-image）', 'missing-image'],
    ]);
    expect(
      createStartScreenMusicOptions(missingStartScreen, assets),
    ).toEqual([
      ['无', ''],
      ['主题曲.ogg', 'music-1'],
      ['缺失音频（missing-audio）', 'missing-audio'],
    ]);
  });

  it('translates Blockly dropdown changes, including “无”, into one complete update', () => {
    const workspace = new Blockly.Workspace();
    renderStartScreenBlocks(workspace, project.startScreen, assets);
    const root = workspace.getBlockById(START_SCREEN_BLOCK_IDS.root);
    const background = workspace.getBlockById(
      START_SCREEN_BLOCK_IDS.background,
    );
    const music = workspace.getBlockById(START_SCREEN_BLOCK_IDS.music);
    background?.setFieldValue(
      'background-1',
      START_SCREEN_BLOCK_FIELDS.backgroundAssetId,
    );
    music?.setFieldValue('', START_SCREEN_BLOCK_FIELDS.musicAssetId);
    root?.setFieldValue(
      '新的主界面标题',
      START_SCREEN_BLOCK_FIELDS.title,
    );

    expect(
      getStartScreenFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: START_SCREEN_BLOCK_IDS.root,
          element: 'field',
          name: START_SCREEN_BLOCK_FIELDS.title,
        } as Blockly.Events.BlockChange,
        workspace,
      ),
    ).toEqual({
      title: '新的主界面标题',
      backgroundAssetId: 'background-1',
      musicAssetId: null,
    });
    expect(
      getStartScreenFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: START_SCREEN_BLOCK_IDS.music,
          element: 'field',
          name: 'UNRELATED',
        } as Blockly.Events.BlockChange,
        workspace,
      ),
    ).toBeNull();

    workspace.dispose();
  });

  it('offers whole-title preview without separate clear actions in block mode', () => {

    document.body.innerHTML = renderToStaticMarkup(
      <StartScreenEditor
        project={project}
        assets={[]}
        isBusy={false}
        isStartPreviewDisabled={false}
        onSceneChange={async () => {}}
        onUpdateStartScreen={async () => true}
        onDraftDirtyChange={() => {}}
        onStartPreview={() => {}}
      />,
    );
    expect(
      document.querySelector('[aria-label="预览完整主界面"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(document.body.textContent).not.toContain('清除背景');
    expect(document.body.textContent).not.toContain('清除音乐');
  });

  it('edits both assets through form selects and previews the complete title design', async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const root = createRoot(container);
    const formRef = createRef<StartScreenEditorHandle>();
    const onUpdateStartScreen = vi.fn().mockResolvedValue(true);
    const onStartPreview = vi.fn();

    await act(async () => {
      root.render(
        <StartScreenFormEditor
          ref={formRef}
          project={project}
          assets={assets}
          backgroundUrl="vn-asset://preview/night-sky"
          isBusy={false}
          isStartPreviewDisabled={false}
          onSceneChange={async () => {}}
          onUpdateStartScreen={onUpdateStartScreen}
          onDraftDirtyChange={() => {}}
          onStartPreview={onStartPreview}
        />,
      );
    });

    const backgroundSelect = container.querySelector(
      '[aria-label="主界面背景图片"]',
    ) as HTMLSelectElement;
    const musicSelect = container.querySelector(
      '[aria-label="主界面背景音乐"]',
    ) as HTMLSelectElement;
    expect(backgroundSelect).toBeInstanceOf(HTMLSelectElement);
    expect(musicSelect).toBeInstanceOf(HTMLSelectElement);
    const titleInput = container.querySelector(
      '[aria-label="主界面游戏名称"]',
    ) as HTMLInputElement;
    expect(titleInput).toBeInstanceOf(HTMLInputElement);
    expect(titleInput.value).toBe('Start screen title');
    expect(
      [...backgroundSelect.options].map((option) => [
        option.text,
        option.value,
      ]),
    ).toEqual([
      ['无', ''],
      ['夜空.png', 'background-1'],
    ]);
    expect(
      [...musicSelect.options].map((option) => [
        option.text,
        option.value,
      ]),
    ).toEqual([
      ['无', ''],
      ['主题曲.ogg', 'music-1'],
    ]);

    await act(async () => {
      titleInput.focus();
      setInputValue(titleInput, '自定义游戏名');
    });
    await act(async () => {
      await expect(formRef.current?.flushPendingDraft()).resolves.toBe(
        true,
      );
    });
    expect(onUpdateStartScreen).toHaveBeenLastCalledWith(
      '自定义游戏名',
      null,
      'music-1',
    );

    const projectWithTitle: ProjectDocument = {
      ...project,
      startScreen: {
        ...project.startScreen,
        title: '自定义游戏名',
      },
    };
    await act(async () => {
      root.render(
        <StartScreenFormEditor
          ref={formRef}
          project={projectWithTitle}
          assets={assets}
          backgroundUrl="vn-asset://preview/night-sky"
          isBusy={false}
          isStartPreviewDisabled={false}
          onSceneChange={async () => {}}
          onUpdateStartScreen={onUpdateStartScreen}
          onDraftDirtyChange={() => {}}
          onStartPreview={onStartPreview}
        />,
      );
    });
    const rerenderedBackgroundSelect = container.querySelector(
      '[aria-label="主界面背景图片"]',
    ) as HTMLSelectElement;
    await act(async () =>
      setSelectValue(rerenderedBackgroundSelect, 'background-1'),
    );
    expect(onUpdateStartScreen).toHaveBeenLastCalledWith(
      '自定义游戏名',
      'background-1',
      'music-1',
    );

    const projectWithBackground: ProjectDocument = {
      ...projectWithTitle,
      startScreen: {
        title: '自定义游戏名',
        backgroundAssetId: 'background-1',
        musicAssetId: 'music-1',
      },
    };
    await act(async () => {
      root.render(
        <StartScreenFormEditor
          ref={formRef}
          project={projectWithBackground}
          assets={assets}
          backgroundUrl="vn-asset://preview/night-sky"
          isBusy={false}
          isStartPreviewDisabled={false}
          onSceneChange={async () => {}}
          onUpdateStartScreen={onUpdateStartScreen}
          onDraftDirtyChange={() => {}}
          onStartPreview={onStartPreview}
        />,
      );
    });
    const rerenderedMusicSelect = container.querySelector(
      '[aria-label="主界面背景音乐"]',
    ) as HTMLSelectElement;
    await act(async () => setSelectValue(rerenderedMusicSelect, ''));
    expect(onUpdateStartScreen).toHaveBeenLastCalledWith(
      '自定义游戏名',
      'background-1',
      null,
    );

    expect(
      container.querySelector<HTMLImageElement>(
        '.start-screen-design-preview img',
      )?.src,
    ).toContain('vn-asset://preview/night-sky');
    expect(container.textContent).toContain('自定义游戏名');
    expect(container.textContent).toContain('开始游戏');
    expect(container.textContent).toContain('读取游戏');
    expect(container.textContent).toContain('CG 画廊');
    expect(container.textContent).toContain('选项');
    expect(container.textContent).toContain('退出游戏');
    expect(
      container.querySelector('.start-screen-design-actions')?.children,
    ).toHaveLength(5);
    expect(
      container.querySelector(
        '.start-screen-design-fit > .start-screen-design-card',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain('清除背景');
    expect(container.textContent).not.toContain('清除音乐');

    const previewButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="预览完整主界面"]',
    );
    await act(async () => previewButton?.click());
    expect(onStartPreview).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it('cancels a title draft with Escape and resets dirty text for another project', async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const root = createRoot(container);
    const onUpdateStartScreen = vi.fn().mockResolvedValue(true);
    const renderForm = async (nextProject: ProjectDocument) => {
      await act(async () => {
        root.render(
          <StartScreenFormEditor
            project={nextProject}
            assets={assets}
            backgroundUrl={null}
            isBusy={false}
            isStartPreviewDisabled={false}
            onSceneChange={async () => {}}
            onUpdateStartScreen={onUpdateStartScreen}
            onDraftDirtyChange={() => {}}
            onStartPreview={() => {}}
          />,
        );
      });
    };

    await renderForm(project);
    let titleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="主界面游戏名称"]',
    );
    expect(titleInput).not.toBeNull();
    await act(async () => {
      titleInput?.focus();
      if (titleInput) {
        setInputValue(titleInput, '应该被取消');
        pressInputKey(titleInput, 'Escape');
      }
    });
    expect(titleInput?.value).toBe(project.startScreen.title);
    expect(onUpdateStartScreen).not.toHaveBeenCalled();

    await act(async () => {
      titleInput?.focus();
      if (titleInput) {
        setInputValue(titleInput, '不能串到其他项目');
      }
    });
    await renderForm({
      ...project,
      id: 'another-project',
      startScreen: {
        ...project.startScreen,
        title: '另一个项目的主界面',
      },
    });
    titleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="主界面游戏名称"]',
    );
    expect(titleInput?.value).toBe('另一个项目的主界面');

    await act(async () => root.unmount());
  });
});
