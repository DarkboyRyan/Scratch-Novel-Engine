/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 useEngineProject asset state 的行为。
 * 测试覆盖：`useEngineProject asset state`。
 */

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorPlatformGateway } from '../../src/renderer/application/editorPlatformGateway';
import {
  useEngineProject,
  type EngineProjectState,
} from '../../src/renderer/hooks/useEngineProject';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
} from '../../src/shared/projectTypes';

const initialResult: EngineMutationResult = {
  project: {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Initial story',
    entrySceneId: 'scene-1',
    startScreen: {
      title: 'Initial story',
      eyebrow: 'A VN ENGINE STORY',
      backgroundAssetId: null,
      musicAssetId: null,
      style: { ...DEFAULT_START_SCREEN_STYLE },
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array(9).fill(null) }],
      style: { ...DEFAULT_CG_GALLERY_STYLE },
    },
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: 'Scene 1',
        backgroundAssetId: null,
        backgroundScalePercent: 100,
        nodes: [],
      },
    ],
  },
  assets: [],
  session: {
    revision: 2,
    savedRevision: 2,
    isDirty: false,
  },
};

const importedResult: EngineMutationResult = {
  ...initialResult,
  assets: [
    {
      id: 'asset-1',
      type: 'image',
      displayName: 'portrait.png',
    },
  ],
  session: {
    revision: 3,
    savedRevision: 2,
    isDirty: true,
  },
  assetId: 'asset-1',
};

const importedVideoResult: EngineMutationResult = {
  ...importedResult,
  assets: [
    ...importedResult.assets,
    {
      id: 'video-1',
      type: 'video',
      displayName: 'opening.mp4',
    },
  ],
  session: {
    revision: 4,
    savedRevision: 2,
    isDirty: true,
  },
  assetId: 'video-1',
};

const importedAudioResult: EngineMutationResult = {
  ...importedVideoResult,
  assets: [
    ...importedVideoResult.assets,
    {
      id: 'audio-1',
      type: 'audio',
      displayName: 'voice.mp3',
    },
  ],
  session: {
    revision: 5,
    savedRevision: 2,
    isDirty: true,
  },
  assetId: 'audio-1',
};

const backgroundResult: EngineMutationResult = {
  ...initialResult,
  project: {
    ...initialResult.project,
    scenes: [
      {
        ...initialResult.project.scenes[0],
        nodes: [
          {
            id: 'background-1',
            type: 'background',
            assetId: 'asset-1',
            scalePercent: 100,
          },
        ],
      },
    ],
  },
  assets: importedResult.assets,
  session: {
    revision: 4,
    savedRevision: 2,
    isDirty: true,
  },
  nodeId: 'background-1',
};

describe('useEngineProject asset state', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: EngineProjectState | null;
  let importImage: ReturnType<typeof vi.fn>;
  let importVideo: ReturnType<typeof vi.fn>;
  let importAudio: ReturnType<typeof vi.fn>;
  let renameAsset: ReturnType<typeof vi.fn>;
  let deleteAssets: ReturnType<typeof vi.fn>;
  let addBackground: ReturnType<typeof vi.fn>;
  let updateStartScreen: ReturnType<typeof vi.fn>;
  let updateStartScreenStyle: ReturnType<typeof vi.fn>;
  let updateCgGallery: ReturnType<typeof vi.fn>;
  let updateCgGalleryStyle: ReturnType<typeof vi.fn>;
  let replaceSceneContent: ReturnType<typeof vi.fn>;
  let updateBackground: ReturnType<typeof vi.fn>;
  let deleteBackground: ReturnType<typeof vi.fn>;
  let reorderBackground: ReturnType<typeof vi.fn>;
  let deleteTimelineNodes: ReturnType<typeof vi.fn>;
  let reorderTimelineNode: ReturnType<typeof vi.fn>;
  let reorderTimelineNodes: ReturnType<typeof vi.fn>;
  let addVideo: ReturnType<typeof vi.fn>;
  let updateVideo: ReturnType<typeof vi.fn>;
  let addChoice: ReturnType<typeof vi.fn>;
  let addChoiceOption: ReturnType<typeof vi.fn>;
  let updateChoiceOption: ReturnType<typeof vi.fn>;
  let deleteChoiceOption: ReturnType<typeof vi.fn>;
  let reorderChoiceOption: ReturnType<typeof vi.fn>;
  let addStoryExtension: ReturnType<typeof vi.fn>;
  let addLogicIf: ReturnType<typeof vi.fn>;
  let reorderLogicControl: ReturnType<typeof vi.fn>;
  let addCgDisplay: ReturnType<typeof vi.fn>;
  let addCharacter: ReturnType<typeof vi.fn>;
  let updateCharacterEffect: ReturnType<typeof vi.fn>;
  let moveCharacterEffect: ReturnType<typeof vi.fn>;
  let saveProject: ReturnType<typeof vi.fn>;
  let exportGame: ReturnType<typeof vi.fn>;
  let platform: EditorPlatformGateway;

  function Harness() {
    current = useEngineProject(platform);
    return null;
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
    current = null;
    importImage = vi.fn().mockResolvedValue({
      status: 'imported',
      result: importedResult,
    });
    importVideo = vi.fn().mockResolvedValue({
      status: 'imported',
      result: importedVideoResult,
    });
    importAudio = vi.fn().mockResolvedValue({
      status: 'imported',
      result: importedAudioResult,
    });
    renameAsset = vi.fn().mockResolvedValue({
      ...importedResult,
      assets: [{
        ...importedResult.assets[0]!,
        displayName: 'hero.png',
      }],
      session: {
        revision: 4,
        savedRevision: 2,
        isDirty: true,
      },
    });
    deleteAssets = vi.fn().mockResolvedValue({
      ...initialResult,
      session: {
        revision: 5,
        savedRevision: 2,
        isDirty: true,
      },
    });
    addBackground = vi.fn().mockResolvedValue(backgroundResult);
    updateStartScreen = vi.fn().mockResolvedValue({
      ...initialResult,
      project: {
        ...initialResult.project,
        startScreen: {
          ...initialResult.project.startScreen,
          title: 'Custom title',
          eyebrow: 'A CUSTOM STORY',
          backgroundAssetId: 'asset-1',
          musicAssetId: 'audio-1',
        },
      },
      assets: importedAudioResult.assets,
      session: {
        revision: 6,
        savedRevision: 2,
        isDirty: true,
      },
    });
    updateStartScreenStyle = vi.fn().mockImplementation(async (style) => ({
      ...initialResult,
      project: {
        ...initialResult.project,
        startScreen: {
          ...initialResult.project.startScreen,
          style,
        },
      },
      session: {
        revision: 3,
        savedRevision: 2,
        isDirty: true,
      },
    }));
    updateCgGallery = vi.fn().mockResolvedValue({
      ...initialResult,
      project: {
        ...initialResult.project,
        cgGallery: {
          ...initialResult.project.cgGallery,
          pages: [{
            imageAssetIds: ['asset-1', null, null, null, null, null, null, null, null],
          }],
        },
      },
      assets: importedResult.assets,
      session: {
        revision: 3,
        savedRevision: 2,
        isDirty: true,
      },
    });
    updateCgGalleryStyle = vi.fn().mockImplementation(async (style) => ({
      ...initialResult,
      project: {
        ...initialResult.project,
        cgGallery: {
          ...initialResult.project.cgGallery,
          style,
        },
      },
      session: {
        revision: 3,
        savedRevision: 2,
        isDirty: true,
      },
    }));
    replaceSceneContent = vi.fn().mockImplementation(async ({ draft }) => ({
      ...initialResult,
      project: {
        ...initialResult.project,
        scenes: [{
          ...initialResult.project.scenes[0]!,
          name: draft.name,
          backgroundAssetId: draft.initialBackground.assetId,
          backgroundScalePercent: draft.initialBackground.scalePercent,
          nodes: [{
            id: 'dialogue-from-code',
            type: 'dialogue',
            speaker: '',
            text: 'Applied from Code',
            voiceAssetId: null,
          }],
        }],
      },
      session: {
        revision: 3,
        savedRevision: 2,
        isDirty: true,
      },
    }));
    updateBackground = vi.fn().mockResolvedValue(backgroundResult);
    deleteBackground = vi.fn().mockResolvedValue(backgroundResult);
    reorderBackground = vi.fn().mockResolvedValue(backgroundResult);
    deleteTimelineNodes = vi.fn().mockResolvedValue(backgroundResult);
    reorderTimelineNode = vi.fn().mockResolvedValue(backgroundResult);
    reorderTimelineNodes = vi.fn().mockResolvedValue(backgroundResult);
    addVideo = vi.fn().mockResolvedValue(backgroundResult);
    updateVideo = vi.fn().mockResolvedValue(backgroundResult);
    addChoice = vi.fn().mockResolvedValue(backgroundResult);
    addChoiceOption = vi.fn().mockResolvedValue(backgroundResult);
    updateChoiceOption = vi.fn().mockResolvedValue(backgroundResult);
    deleteChoiceOption = vi.fn().mockResolvedValue(backgroundResult);
    reorderChoiceOption = vi.fn().mockResolvedValue(backgroundResult);
    addStoryExtension = vi.fn().mockResolvedValue(backgroundResult);
    addLogicIf = vi.fn().mockResolvedValue(backgroundResult);
    reorderLogicControl = vi.fn().mockResolvedValue(backgroundResult);
    addCgDisplay = vi.fn().mockResolvedValue(backgroundResult);
    addCharacter = vi.fn().mockResolvedValue(backgroundResult);
    updateCharacterEffect = vi.fn().mockResolvedValue(backgroundResult);
    moveCharacterEffect = vi.fn().mockResolvedValue(backgroundResult);
    saveProject = vi.fn().mockResolvedValue({
      cancelled: false,
      result: initialResult,
      session: {
        hasStorage: true,
        projectFolderName: 'story',
        ...initialResult.session,
      },
    });
    exportGame = vi.fn().mockResolvedValue({
      cancelled: false,
      output: 'runtime-bundle',
      artifactName: 'Initial story.vngame',
      sourceRevision: 2,
      assetCount: 0,
    });

    platform = {
      engine: {
        imageScaleContractVersion: 1,
        surfaceStyleContractVersion: 1,
        storyCodeContractVersion: 1,
        ensureProject: vi.fn().mockResolvedValue(initialResult),
        updateStartScreen,
        updateStartScreenStyle,
        updateCgGallery,
        updateCgGalleryStyle,
        replaceSceneContent,
        addBackground,
        updateBackground,
        deleteBackground,
        reorderBackground,
        deleteTimelineNodes,
        reorderTimelineNode,
        reorderTimelineNodes,
        addVideo,
        updateVideo,
        addChoice,
        addChoiceOption,
        updateChoiceOption,
        deleteChoiceOption,
        reorderChoiceOption,
        addStoryExtension,
        addLogicIf,
        reorderLogicControl,
        addCgDisplay,
        addCharacter,
        updateCharacterEffect,
        moveCharacterEffect,
      } as unknown as EditorPlatformGateway['engine'],
      projectFiles: {
        getSession: vi.fn().mockResolvedValue({
          hasStorage: true,
          projectFolderName: 'story',
          ...initialResult.session,
        }),
        saveProject,
      } as unknown as EditorPlatformGateway['projectFiles'],
      assets: {
        managementContractVersion: 1,
        importImage,
        importVideo,
        importAudio,
        renameAsset,
        deleteAssets,
      } as unknown as EditorPlatformGateway['assets'],
      gameExport: {
        exportGame,
      },
    };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('applies initial and imported project, assets, and session together', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    expect(current).not.toBeNull();
    expect(current?.project?.name).toBe('Initial story');
    expect(current?.assets).toEqual([]);
    expect(current?.session).toEqual({
      hasStorage: true,
      projectFolderName: 'story',
      ...initialResult.session,
    });

    let status: Awaited<ReturnType<EngineProjectState['importImage']>>;
    await act(async () => {
      status = await current!.importImage();
    });

    expect(status!).toBe('imported');
    expect(importImage).toHaveBeenCalledWith();
    expect(current?.assets).toEqual(importedResult.assets);
    expect(current?.session).toEqual({
      hasStorage: true,
      projectFolderName: 'story',
      ...importedResult.session,
    });
  });

  it('applies authoritative asset rename and delete snapshots', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.renameAsset('asset-1', 'hero.png')).toBe(true);
    });
    expect(renameAsset).toHaveBeenCalledWith('asset-1', 'hero.png');
    expect(current!.assets).toEqual([{
      id: 'asset-1',
      type: 'image',
      displayName: 'hero.png',
    }]);
    expect(current!.session.revision).toBe(4);

    await act(async () => {
      expect(await current!.deleteAssets(['asset-1'])).toBe(true);
    });
    expect(deleteAssets).toHaveBeenCalledWith(['asset-1']);
    expect(current!.assets).toEqual([]);
    expect(current!.session.revision).toBe(5);
    expect(current!.projectGeneration).toBe(1);
  });

  it('localizes asset-management business error codes in English', async () => {
    await act(async () => {
      root.render(
        <EditorI18nProvider language="en-US">
          <Harness />
        </EditorI18nProvider>,
      );
    });

    const cases: Array<{
      code: string;
      message: string;
      action: 'rename' | 'delete';
    }> = [
      {
        code: 'asset_name_invalid',
        message: 'The asset name is invalid. It cannot be empty or exceed 256 UTF-8 bytes.',
        action: 'rename',
      },
      {
        code: 'asset_name_conflict',
        message: 'An asset of this type already uses that name. Use a different name.',
        action: 'rename',
      },
      {
        code: 'asset_in_use',
        message: 'This asset is still referenced by the complete project, possibly by a hidden legacy initial portrait. Remove the reference first.',
        action: 'delete',
      },
      {
        code: 'asset_not_found',
        message: 'This asset no longer exists. Refresh the project and try again.',
        action: 'delete',
      },
    ];

    for (const testCase of cases) {
      const error = new Error('资源操作失败');
      error.name = `VnEngineError:${testCase.code}`;
      (testCase.action === 'rename' ? renameAsset : deleteAssets)
        .mockRejectedValueOnce(error);
      await act(async () => {
        const succeeded = testCase.action === 'rename'
          ? await current!.renameAsset('asset-1', 'candidate.png')
          : await current!.deleteAssets(['asset-1']);
        expect(succeeded).toBe(false);
      });
      expect(current!.engineMessage).toBe(testCase.message);
    }
  });

  it('reports stable restart guidance for a stale asset-management preload', async () => {
    platform = {
      ...platform,
      assets: {
        importImage,
        importVideo,
        importAudio,
      } as unknown as EditorPlatformGateway['assets'],
    };
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.deleteAssets(['asset-1'])).toBe(false);
    });
    expect(deleteAssets).not.toHaveBeenCalled();
    expect(current!.engineMessage).toBe(
      '资源管理功能已更新，请完全退出并重新启动 Editor 后再试。',
    );
  });

  it('projects a pre-CG live snapshot as an empty gallery instead of crashing', async () => {
    const legacyProject = structuredClone(initialResult.project);
    delete (legacyProject as Partial<typeof legacyProject>).cgGallery;
    delete (
      legacyProject.startScreen as Partial<
        typeof legacyProject.startScreen
      >
    ).eyebrow;
    delete (
      legacyProject.startScreen as Partial<
        typeof legacyProject.startScreen
      >
    ).style;
    const legacyResult = {
      ...initialResult,
      project: legacyProject,
    } as unknown as EngineMutationResult;
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        ensureProject: vi.fn().mockResolvedValue(legacyResult),
        getProject: vi.fn().mockResolvedValue(legacyResult),
      },
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(current?.project?.cgGallery).toEqual({
      pages: [{ imageAssetIds: Array(9).fill(null) }],
      style: DEFAULT_CG_GALLERY_STYLE,
    });
    expect(current?.project?.startScreen.eyebrow).toBe(
      'A VN ENGINE STORY',
    );
    expect(current?.project?.startScreen.style).toEqual(
      DEFAULT_START_SCREEN_STYLE,
    );
    expect(current?.engineMessage).toBe('');

    let snapshot: Awaited<ReturnType<EngineProjectState['getProjectSnapshot']>>;
    await act(async () => {
      snapshot = await current!.getProjectSnapshot();
    });
    expect(snapshot!.cgGallery).toEqual({
      pages: [{ imageAssetIds: Array(9).fill(null) }],
      style: DEFAULT_CG_GALLERY_STYLE,
    });
    expect(snapshot!.startScreen.eyebrow).toBe('A VN ENGINE STORY');
  });

  it('projects a pre-v19 HMR portrait with show mode and effect null', async () => {
    const legacyProject = structuredClone(initialResult.project) as unknown as {
      scenes: Array<{ nodes: unknown[] }>;
    };
    legacyProject.scenes[0]!.nodes = [{
      id: 'legacy-character',
      type: 'character',
      assetId: 'asset-1',
      slot: 'center',
      layer: 1,
      position: null,
    }];
    const legacyResult = {
      ...initialResult,
      project: legacyProject,
    } as unknown as EngineMutationResult;
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        ensureProject: vi.fn().mockResolvedValue(legacyResult),
        getProject: vi.fn().mockResolvedValue(legacyResult),
      },
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(current?.project?.scenes[0]!.nodes).toEqual([{
      id: 'legacy-character',
      type: 'character',
      mode: 'show',
      assetId: 'asset-1',
      slot: 'center',
      layer: 1,
      position: null,
      effect: null,
      scalePercent: 100,
    }]);
    let snapshot: Awaited<ReturnType<EngineProjectState['getProjectSnapshot']>>;
    await act(async () => {
      snapshot = await current!.getProjectSnapshot();
    });
    expect(snapshot!.scenes[0]!.nodes[0]).toMatchObject({
      mode: 'show',
      effect: null,
      scalePercent: 100,
    });
  });

  it('normalizes stale or non-canonical live image scales', async () => {
    const legacyProject = structuredClone(initialResult.project) as unknown as {
      scenes: Array<{
        backgroundScalePercent: number;
        nodes: unknown[];
      }>;
    };
    legacyProject.scenes[0]!.backgroundScalePercent = 200;
    legacyProject.scenes[0]!.nodes = [
      {
        id: 'legacy-background',
        type: 'background',
        assetId: null,
        scalePercent: 200,
      },
      {
        id: 'legacy-clear',
        type: 'character',
        mode: 'clear',
        assetId: null,
        slot: 'center',
        layer: 1,
        position: null,
        effect: null,
        scalePercent: 200,
      },
      {
        id: 'legacy-show',
        type: 'character',
        mode: 'show',
        assetId: 'asset-1',
        slot: 'center',
        layer: 1,
        position: null,
        effect: null,
        scalePercent: 999,
      },
    ];
    const legacyResult = {
      ...initialResult,
      project: legacyProject,
    } as unknown as EngineMutationResult;
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        ensureProject: vi.fn().mockResolvedValue(legacyResult),
      },
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(current?.project?.scenes[0]).toMatchObject({
      backgroundScalePercent: 100,
      nodes: [
        { id: 'legacy-background', scalePercent: 100 },
        { id: 'legacy-clear', scalePercent: 100 },
        { id: 'legacy-show', scalePercent: 100 },
      ],
    });
  });

  it('reuses the pending startup request when StrictMode repeats the effect', async () => {
    let resolveInitialProject: (
      result: EngineMutationResult,
    ) => void = () => {};
    const pendingInitialProject = new Promise<EngineMutationResult>(
      (resolve) => {
        resolveInitialProject = resolve;
      },
    );
    const ensureProject = vi
      .fn()
      .mockReturnValue(pendingInitialProject);
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        ensureProject,
      },
    };

    await act(async () => {
      root.render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    expect(ensureProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitialProject(initialResult);
      await pendingInitialProject;
    });

    expect(current?.project?.name).toBe('Initial story');
    expect(current?.engineMessage).toBe('');
  });

  it('applies an imported video to the public resource list', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.importVideo()).toBe('imported');
    });

    expect(importVideo).toHaveBeenCalledWith();
    expect(current?.assets).toEqual(importedVideoResult.assets);
    expect(current?.assets.at(-1)).toMatchObject({
      type: 'video',
      displayName: 'opening.mp4',
    });
  });

  it('applies an imported audio asset to the public resource list', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.importAudio()).toBe('imported');
    });

    expect(importAudio).toHaveBeenCalledWith();
    expect(current?.assets.at(-1)).toMatchObject({
      type: 'audio',
      displayName: 'voice.mp3',
    });
  });

  it('updates the start screen title and resources in one queued mutation', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.updateStartScreen(
          'Custom title',
          'A CUSTOM STORY',
          'asset-1',
          'audio-1',
        ),
      ).toBe(true);
    });

    expect(updateStartScreen).toHaveBeenCalledWith({
      title: 'Custom title',
      eyebrow: 'A CUSTOM STORY',
      backgroundAssetId: 'asset-1',
      musicAssetId: 'audio-1',
    });
    expect(current?.project?.startScreen).toEqual({
      title: 'Custom title',
      eyebrow: 'A CUSTOM STORY',
      backgroundAssetId: 'asset-1',
      musicAssetId: 'audio-1',
      style: DEFAULT_START_SCREEN_STYLE,
    });
  });

  it.each([
    'Renderer 发来了无效的引擎请求',
    'unknown method: startScreen.update',
  ])('requires a full restart when stale Main rejects the title-screen update: %s', async (message) => {
    updateStartScreen.mockRejectedValue(new Error(message));
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.updateStartScreen(
          'Unsaved title',
          '未保存标语',
          null,
          null,
        ),
      ).toBe(false);
    });

    expect(current?.engineMessage).toBe(
      '主界面模块已更新，请完全退出并重新启动编辑器后再保存标题界面',
    );
    expect(current?.project?.startScreen).toEqual(
      initialResult.project.startScreen,
    );
    expect(current?.session.isDirty).toBe(false);
  });

  it('requires a full restart when stale Preload has no title-screen command', async () => {
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        updateStartScreen: undefined,
      } as unknown as EditorPlatformGateway['engine'],
    };
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.updateStartScreen('Title', '', null, null),
      ).toBe(false);
    });

    expect(current?.engineMessage).toBe(
      '主界面模块已更新，请完全退出并重新启动编辑器后再保存标题界面',
    );
    expect(updateStartScreen).not.toHaveBeenCalled();
  });

  it('localizes stale title-screen restart guidance in English', async () => {
    updateStartScreen.mockRejectedValue(
      new Error('Renderer 发来了无效的引擎请求'),
    );
    await act(async () => {
      root.render(
        <EditorI18nProvider language="en-US">
          <Harness />
        </EditorI18nProvider>,
      );
    });

    await act(async () => {
      expect(
        await current!.updateStartScreen('Title', 'Story', null, null),
      ).toBe(false);
    });
    expect(current?.engineMessage).toBe(
      'The title-screen module was updated. Fully quit and restart the Editor before saving the title screen.',
    );
  });

  it('updates fixed CG pages in one queued mutation', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    const pages = [{
      imageAssetIds: ['asset-1', null, null, null, null, null, null, null, null],
    }];
    await act(async () => {
      expect(await current!.updateCgGallery(pages)).toBe(true);
    });

    expect(updateCgGallery).toHaveBeenCalledWith(pages);
    expect(current?.project?.cgGallery.pages).toEqual(pages);
  });

  it('updates title and CG page styles in queued mutations', async () => {
    await act(async () => {
      root.render(<Harness />);
    });
    const startStyle = {
      ...DEFAULT_START_SCREEN_STYLE,
      layout: 'center' as const,
    };
    const galleryStyle = {
      ...DEFAULT_CG_GALLERY_STYLE,
      gapPx: 24,
    };

    await act(async () => {
      expect(await current!.updateStartScreenStyle(startStyle)).toBe(true);
      expect(await current!.updateCgGalleryStyle(galleryStyle)).toBe(true);
    });

    expect(updateStartScreenStyle).toHaveBeenCalledWith(startStyle);
    expect(updateCgGalleryStyle).toHaveBeenCalledWith(galleryStyle);
    expect(current?.project?.cgGallery.style).toEqual(galleryStyle);
  });

  it('refuses page-style writes from a stale live preload', async () => {
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        surfaceStyleContractVersion: undefined,
      },
    };
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.updateStartScreenStyle(DEFAULT_START_SCREEN_STYLE),
      ).toBe(false);
      expect(
        await current!.updateCgGalleryStyle(DEFAULT_CG_GALLERY_STYLE),
      ).toBe(false);
    });

    expect(updateStartScreenStyle).not.toHaveBeenCalled();
    expect(updateCgGalleryStyle).not.toHaveBeenCalled();
    expect(current?.engineMessage).toContain('页面样式功能已更新');
  });

  it('applies an atomic story-Code replacement snapshot', async () => {
    await act(async () => {
      root.render(<Harness />);
    });
    const draft = {
      name: 'Renamed from Code',
      initialBackground: { assetId: null, scalePercent: 100 },
      nodes: [{
        originId: 'dialogue-1',
        type: 'dialogue' as const,
        speaker: '',
        text: 'Applied from Code',
        voiceAssetId: null,
      }],
    };

    await act(async () => {
      expect(
        await current!.replaceSceneContent({ sceneId: 'scene-1', draft }),
      ).toBe(true);
    });

    expect(replaceSceneContent).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      draft,
    });
    expect(current?.project?.scenes[0]).toMatchObject({
      name: 'Renamed from Code',
      nodes: [{ type: 'dialogue', text: 'Applied from Code' }],
    });
    expect(current?.session).toMatchObject({
      revision: 3,
      savedRevision: 2,
      isDirty: true,
    });
  });

  it('refuses story-Code writes from a stale live preload', async () => {
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        storyCodeContractVersion: undefined,
      },
    };
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.replaceSceneContent({
          sceneId: 'scene-1',
          draft: {
            name: 'Scene 1',
            initialBackground: { assetId: null, scalePercent: 100 },
            nodes: [],
          },
        }),
      ).toBe(false);
    });

    expect(replaceSceneContent).not.toHaveBeenCalled();
    expect(current?.engineMessage).toContain('剧情代码编辑功能已更新');
    expect(current?.project).toEqual(initialResult.project);
  });

  it.each([
    'Renderer 发来了无效的引擎请求',
    'unknown method: scene.content.replace',
  ])(
    'reports actionable English restart guidance when stale Main rejects Story Code: %s',
    async (message) => {
      replaceSceneContent.mockRejectedValue(new Error(message));
      await act(async () => {
        root.render(
          <EditorI18nProvider language="en-US">
            <Harness />
          </EditorI18nProvider>,
        );
      });

      await act(async () => {
        expect(
          await current!.replaceSceneContent({
            sceneId: 'scene-1',
            draft: {
              name: 'Scene 1',
              initialBackground: { assetId: null, scalePercent: 100 },
              nodes: [{
                originId: 'dialogue-1',
                type: 'dialogue',
                speaker: 'Father',
                text: 'test?',
                voiceAssetId: null,
              }],
            },
          }),
        ).toBe(false);
      });

      expect(current?.engineMessage).toBe(
        'Story Code editing was updated. Fully quit and restart Editor, then try again.',
      );
      expect(current?.engineMessage).not.toBe(
        'The C++ backend returned an unknown error',
      );
      expect(current?.project).toEqual(initialResult.project);
    },
  );

  it('reports an actionable English error for a stale C++ response schema', async () => {
    replaceSceneContent.mockRejectedValue(
      new Error('C++ 后端响应格式不正确（请求 7）'),
    );
    await act(async () => {
      root.render(
        <EditorI18nProvider language="en-US">
          <Harness />
        </EditorI18nProvider>,
      );
    });

    await act(async () => {
      expect(
        await current!.replaceSceneContent({
          sceneId: 'scene-1',
          draft: {
            name: 'Scene 1',
            initialBackground: { assetId: null, scalePercent: 100 },
            nodes: [{
              originId: 'dialogue-1',
              type: 'dialogue',
              speaker: 'Father',
              text: 'test?',
              voiceAssetId: null,
            }],
          },
        }),
      ).toBe(false);
    });

    expect(current?.engineMessage).toBe(
      'The Editor and C++ backend are out of sync. Fully quit and restart Editor, then try again; if it continues, rebuild the backend.',
    );
    expect(current?.engineMessage).not.toBe(
      'The C++ backend returned an unknown error',
    );
    expect(current?.project).toEqual(initialResult.project);
  });

  it('commits, saves, and exports one clean persisted revision', async () => {
    const order: string[] = [];
    const prepare = vi.fn(async () => {
      order.push('prepare');
      return true;
    });
    saveProject.mockImplementation(async () => {
      order.push('save');
      return {
        cancelled: false,
        result: initialResult,
        session: {
          hasStorage: true,
          projectFolderName: 'story',
          ...initialResult.session,
        },
      };
    });
    exportGame.mockImplementation(async () => {
      order.push('export');
      return {
        cancelled: false,
        output: 'runtime-bundle',
        artifactName: 'Initial story.vngame',
        sourceRevision: 2,
        assetCount: 0,
      };
    });

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.exportGame(prepare)).toBe('exported');
    });

    expect(order).toEqual(['prepare', 'save', 'export']);
    expect(exportGame).toHaveBeenCalledWith({ output: 'runtime-bundle' });
    expect(current?.isExporting).toBe(false);
    expect(current?.isBusy).toBe(false);
    expect(current?.exportMessage).toBe(
      '已导出内容包 Initial story.vngame（0 项资源）',
    );
  });

  it('does not retain a completed export summary in the previous language', async () => {
    await act(async () => {
      root.render(
        <EditorI18nProvider language="zh-CN">
          <Harness />
        </EditorI18nProvider>,
      );
    });
    await act(async () => {
      expect(await current!.exportGame(async () => true)).toBe('exported');
    });
    expect(current?.exportMessage).toContain('已导出内容包');

    await act(async () => {
      root.render(
        <EditorI18nProvider language="en-US">
          <Harness />
        </EditorI18nProvider>,
      );
    });

    expect(current?.exportMessage).toBe('');
  });

  it('does not invoke export when first save is cancelled', async () => {
    saveProject.mockResolvedValue({
      cancelled: true,
      session: {
        hasStorage: false,
        projectFolderName: null,
        revision: 2,
        savedRevision: null,
        isDirty: true,
      },
    });

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.exportGame(async () => true)).toBe('cancelled');
    });

    expect(exportGame).not.toHaveBeenCalled();
    expect(current?.exportMessage).toBe('已取消保存，未开始导出');
    expect(current?.isBusy).toBe(false);
  });

  it('refuses to export a save result that is still dirty', async () => {
    const dirtyResult: EngineMutationResult = {
      ...initialResult,
      session: {
        revision: 3,
        savedRevision: 2,
        isDirty: true,
      },
    };
    saveProject.mockResolvedValue({
      cancelled: false,
      result: dirtyResult,
      session: {
        hasStorage: true,
        projectFolderName: 'story',
        ...dirtyResult.session,
      },
    });

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.exportGame(async () => true)).toBe('failed');
    });

    expect(exportGame).not.toHaveBeenCalled();
    expect(current?.engineMessage).toBe('项目尚未完整保存，无法导出游戏');
    expect(current?.isBusy).toBe(false);
  });

  it('reports an export-dialog cancellation without exposing a path', async () => {
    exportGame.mockResolvedValue({ cancelled: true });

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.exportGame(async () => true)).toBe('cancelled');
    });

    expect(exportGame).toHaveBeenCalledWith({ output: 'runtime-bundle' });
    expect(current?.exportMessage).toBe('已取消导出');
    expect(current?.engineMessage).toBe('');
  });

  it('reports an export failure and always releases the busy state', async () => {
    exportGame.mockRejectedValue(new Error('运行时内容包写入失败'));

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.exportGame(async () => true)).toBe('failed');
    });

    expect(current?.engineMessage).toBe('运行时内容包写入失败');
    expect(current?.exportMessage).toBe('');
    expect(current?.isExporting).toBe(false);
    expect(current?.isBusy).toBe(false);
  });

  it('keeps every file action busy until the export request settles', async () => {
    let resolveExport: (
      result: Awaited<ReturnType<EditorPlatformGateway['gameExport']['exportGame']>>,
    ) => void = () => {};
    let markExportStarted: () => void = () => {};
    const exportStarted = new Promise<void>((resolve) => {
      markExportStarted = resolve;
    });
    const pendingExport = new Promise<
      Awaited<ReturnType<EditorPlatformGateway['gameExport']['exportGame']>>
    >((resolve) => {
      resolveExport = resolve;
    });
    exportGame.mockImplementation(() => {
      markExportStarted();
      return pendingExport;
    });

    await act(async () => {
      root.render(<Harness />);
    });

    let result: Promise<unknown> = Promise.resolve();
    await act(async () => {
      result = current!.exportGame(async () => true);
      await exportStarted;
    });

    expect(current?.isExporting).toBe(true);
    expect(current?.isBusy).toBe(true);

    await act(async () => {
      resolveExport({
        cancelled: false,
        output: 'runtime-bundle',
        artifactName: 'Initial story.vngame',
        sourceRevision: 2,
        assetCount: 0,
      });
      await result;
    });

    expect(current?.isExporting).toBe(false);
    expect(current?.isBusy).toBe(false);
  });

  it('queues background actions through the typed engine API', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.addBackground({
          sceneId: 'scene-1',
          afterNodeId: null,
        }),
      ).toBe(true);
      expect(
        await current!.updateBackground({
          sceneId: 'scene-1',
          nodeId: 'background-1',
          assetId: 'asset-2',
          scalePercent: 80,
        }),
      ).toBe(true);
      expect(
        await current!.reorderBackground({
          sceneId: 'scene-1',
          nodeId: 'background-1',
          beforeNodeId: null,
        }),
      ).toBe(true);
      expect(
        await current!.deleteBackground({
          sceneId: 'scene-1',
          nodeId: 'background-1',
        }),
      ).toBe(true);
    });

    expect(addBackground).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      afterNodeId: null,
    });
    expect(updateBackground).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'background-1',
      assetId: 'asset-2',
      scalePercent: 80,
    });
    expect(reorderBackground).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'background-1',
      beforeNodeId: null,
    });
    expect(deleteBackground).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'background-1',
    });
    expect(current?.project?.scenes[0].nodes[0]).toEqual({
      id: 'background-1',
      type: 'background',
      assetId: 'asset-1',
      scalePercent: 100,
    });
    expect(current?.session).toMatchObject(backgroundResult.session);
  });

  it('refuses scale writes from a stale live preload', async () => {
    const setSceneBackground = vi.fn().mockResolvedValue(backgroundResult);
    const staleUpdateBackground = vi.fn().mockResolvedValue(backgroundResult);
    const staleUpdateCharacter = vi.fn().mockResolvedValue(backgroundResult);
    platform = {
      ...platform,
      engine: {
        ...platform.engine,
        imageScaleContractVersion: undefined,
        setSceneBackground,
        updateBackground: staleUpdateBackground,
        updateCharacter: staleUpdateCharacter,
      },
    };

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.setSceneBackground('scene-1', 'asset-1', 80),
      ).toBe(false);
      expect(
        await current!.updateBackground({
          sceneId: 'scene-1',
          nodeId: 'background-1',
          assetId: 'asset-1',
          scalePercent: 80,
        }),
      ).toBe(false);
      expect(
        await current!.updateCharacter({
          sceneId: 'scene-1',
          nodeId: 'character-1',
          mode: 'show',
          assetId: 'asset-1',
          slot: 'center',
          layer: 1,
          position: null,
          scalePercent: 125,
        }),
      ).toBe(false);
    });

    expect(setSceneBackground).not.toHaveBeenCalled();
    expect(staleUpdateBackground).not.toHaveBeenCalled();
    expect(staleUpdateCharacter).not.toHaveBeenCalled();
    expect(current?.engineMessage).toContain('完全退出并重新启动 Editor');
  });

  it('queues video-node actions through the typed engine API', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(
        await current!.addVideo({
          sceneId: 'scene-1',
          beforeNodeId: null,
        }),
      ).toBe(true);
      expect(
        await current!.updateVideo({
          sceneId: 'scene-1',
          nodeId: 'video-node-1',
          assetId: 'video-1',
        }),
      ).toBe(true);
    });

    expect(addVideo).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      beforeNodeId: null,
    });
    expect(updateVideo).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'video-node-1',
      assetId: 'video-1',
    });
  });

  it('queues choice container and nested option actions', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    const option = {
      sceneId: 'scene-1',
      nodeId: 'choice-1',
      optionId: 'option-1',
    };
    await act(async () => {
      expect(await current!.addChoice({
        sceneId: 'scene-1',
        beforeNodeId: null,
      })).toBe(true);
      expect(await current!.addChoiceOption({
        sceneId: option.sceneId,
        nodeId: option.nodeId,
        text: '去屋顶',
        targetSceneId: 'scene-2',
        beforeOptionId: null,
      })).toBe(true);
      expect(await current!.updateChoiceOption({
        ...option,
        text: '留在教室',
        targetSceneId: 'scene-3',
      })).toBe(true);
      expect(await current!.reorderChoiceOption({
        ...option,
        beforeOptionId: null,
      })).toBe(true);
      expect(await current!.deleteChoiceOption(option)).toBe(true);
    });

    expect(addChoice).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      beforeNodeId: null,
    });
    expect(addChoiceOption).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'choice-1',
      text: '去屋顶',
      targetSceneId: 'scene-2',
      beforeOptionId: null,
    });
    expect(updateChoiceOption).toHaveBeenCalledWith({
      ...option,
      text: '留在教室',
      targetSceneId: 'scene-3',
    });
    expect(reorderChoiceOption).toHaveBeenCalledWith({
      ...option,
      beforeOptionId: null,
    });
    expect(deleteChoiceOption).toHaveBeenCalledWith(option);
  });

  it('queues atomic mixed timeline actions through the typed engine API', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    const selection = ['dialogue-1', 'background-1'];
    await act(async () => {
      expect(
        await current!.deleteTimelineNodes({
          sceneId: 'scene-1',
          nodeIds: selection,
        }),
      ).toBe(true);
      expect(
        await current!.reorderTimelineNode({
          sceneId: 'scene-1',
          nodeId: 'background-1',
          beforeNodeId: 'dialogue-2',
        }),
      ).toBe(true);
      expect(
        await current!.reorderTimelineNodes({
          sceneId: 'scene-1',
          nodeIds: selection,
          beforeNodeId: null,
        }),
      ).toBe(true);
    });

    expect(deleteTimelineNodes).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeIds: selection,
    });
    expect(reorderTimelineNode).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'background-1',
      beforeNodeId: 'dialogue-2',
    });
    expect(reorderTimelineNodes).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeIds: selection,
      beforeNodeId: null,
    });
  });

  it('queues authoring-only story extension insertion', async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.addStoryExtension({
        sceneId: 'scene-1',
        beforeNodeId: 'dialogue-2',
      })).toBe(true);
    });

    expect(addStoryExtension).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      beforeNodeId: 'dialogue-2',
    });
  });

  it('reports an actionable restart message for a stale story extension backend', async () => {
    addStoryExtension.mockRejectedValue(
      new Error('unknown method: storyExtension.add'),
    );
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.addStoryExtension({
        sceneId: 'scene-1',
        beforeNodeId: null,
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      '延伸模块尚未加载，请完全退出并重新启动编辑器',
    );
  });

  it('reports the same restart message when the stale backend cannot reorder an extension page', async () => {
    reorderTimelineNodes.mockRejectedValue(
      new Error('unknown method: timeline.reorderMany'),
    );
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.reorderTimelineNodes({
        sceneId: 'scene-1',
        nodeIds: ['extension-1', 'dialogue-2'],
        beforeNodeId: null,
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      '延伸模块尚未加载，请完全退出并重新启动编辑器',
    );
  });

  it.each([
    "No handler registered for 'vn-engine:request'",
    'unknown method: logicIf.add',
  ])('reports a restart message for a stale logic backend: %s', async (message) => {
    addLogicIf.mockRejectedValue(new Error(message));
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.addLogicIf({
        sceneId: 'scene-1',
        beforeNodeId: null,
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'A' },
        },
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      '逻辑积木模块尚未加载，请完全退出并重新启动编辑器',
    );
  });

  it('reports restart guidance when stale Main rejects a logic invocation shape', async () => {
    reorderLogicControl.mockRejectedValue(
      new Error('Renderer 发来了无效的引擎请求'),
    );
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.reorderLogicControl({
        sceneId: 'scene-1',
        nodeId: 'if-1',
        beforeNodeId: null,
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      '逻辑积木模块尚未加载，请完全退出并重新启动编辑器',
    );
  });

  it('reports restart guidance when stale Main rejects a CG invocation shape', async () => {
    addCgDisplay.mockRejectedValue(
      new Error('Renderer 发来了无效的引擎请求'),
    );
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.addCgDisplay({
        sceneId: 'scene-1',
        assetId: 'asset-1',
        leadInMs: 750,
        afterNodeId: null,
        beforeNodeId: null,
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      'CG 显示积木模块尚未加载，请完全退出并重新启动编辑器',
    );
  });

  it('reports restart guidance when stale Main rejects a portrait-effect command', async () => {
    updateCharacterEffect.mockRejectedValue(
      new Error('Renderer 发来了无效的引擎请求'),
    );
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.updateCharacterEffect({
        sceneId: 'scene-1',
        nodeId: 'character-1',
        effect: { type: 'fadeIn', durationMs: 500 },
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      '人物特效模块尚未加载，请完全退出并重新启动编辑器',
    );
  });

  it('reports restart guidance when stale Main rejects character mode', async () => {
    addCharacter.mockRejectedValue(
      new Error('Renderer 发来了无效的引擎请求'),
    );
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.addCharacter({
        sceneId: 'scene-1',
        mode: 'show',
        assetId: null,
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      '人物立绘模块已更新，请完全退出并重新启动编辑器',
    );
  });

  it('keeps logic business errors distinct from stale-module failures', async () => {
    const variableLimit = new Error(
      'project cannot contain more than 32 logic variables',
    );
    variableLimit.name = 'VnEngineError:logic_variable_limit';
    addLogicIf.mockRejectedValue(variableLimit);
    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      expect(await current!.addLogicIf({
        sceneId: 'scene-1',
        beforeNodeId: null,
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'A' },
        },
      })).toBe(false);
    });

    expect(current!.engineMessage).toBe(
      '一个项目最多可使用 32 个不同的逻辑变量',
    );
  });
});
