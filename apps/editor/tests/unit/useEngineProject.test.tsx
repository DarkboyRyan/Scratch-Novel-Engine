/** @vitest-environment jsdom */

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorPlatformGateway } from '../../src/renderer/application/editorPlatformGateway';
import {
  useEngineProject,
  type EngineProjectState,
} from '../../src/renderer/hooks/useEngineProject';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';

const initialResult: EngineMutationResult = {
  project: {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Initial story',
    entrySceneId: 'scene-1',
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

    platform = {
      engine: {
        ensureProject: vi.fn().mockResolvedValue(initialResult),
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
      } as unknown as EditorPlatformGateway['engine'],
      projectFiles: {
        getSession: vi.fn().mockResolvedValue({
          hasStorage: true,
          projectFolderName: 'story',
          ...initialResult.session,
        }),
      } as unknown as EditorPlatformGateway['projectFiles'],
      assets: {
        importImage,
        importVideo,
        importAudio,
      } as unknown as EditorPlatformGateway['assets'],
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
});
