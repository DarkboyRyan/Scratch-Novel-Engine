/** @vitest-environment jsdom */

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

const initialResult: EngineMutationResult = {
  project: {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Initial story',
    entrySceneId: 'scene-1',
    startScreen: {
      title: 'Initial story',
      backgroundAssetId: null,
      musicAssetId: null,
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array(9).fill(null) }],
    },
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: 'Scene 1',
        backgroundAssetId: null,
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
  let addBackground: ReturnType<typeof vi.fn>;
  let updateStartScreen: ReturnType<typeof vi.fn>;
  let updateCgGallery: ReturnType<typeof vi.fn>;
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
    addBackground = vi.fn().mockResolvedValue(backgroundResult);
    updateStartScreen = vi.fn().mockResolvedValue({
      ...initialResult,
      project: {
        ...initialResult.project,
        startScreen: {
          title: 'Custom title',
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
    updateCgGallery = vi.fn().mockResolvedValue({
      ...initialResult,
      project: {
        ...initialResult.project,
        cgGallery: {
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
        ensureProject: vi.fn().mockResolvedValue(initialResult),
        updateStartScreen,
        updateCgGallery,
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
        importImage,
        importVideo,
        importAudio,
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

  it('projects a pre-CG live snapshot as an empty gallery instead of crashing', async () => {
    const legacyProject = { ...initialResult.project };
    delete (legacyProject as Partial<typeof legacyProject>).cgGallery;
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
    });
    expect(current?.engineMessage).toBe('');

    let snapshot: Awaited<ReturnType<EngineProjectState['getProjectSnapshot']>>;
    await act(async () => {
      snapshot = await current!.getProjectSnapshot();
    });
    expect(snapshot!.cgGallery).toEqual({
      pages: [{ imageAssetIds: Array(9).fill(null) }],
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
          'asset-1',
          'audio-1',
        ),
      ).toBe(true);
    });

    expect(updateStartScreen).toHaveBeenCalledWith({
      title: 'Custom title',
      backgroundAssetId: 'asset-1',
      musicAssetId: 'audio-1',
    });
    expect(current?.project?.startScreen).toEqual({
      title: 'Custom title',
      backgroundAssetId: 'asset-1',
      musicAssetId: 'audio-1',
    });
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
    });
    expect(current?.session).toMatchObject(backgroundResult.session);
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
