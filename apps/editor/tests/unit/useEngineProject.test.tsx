/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function exposeWindowApi<Key extends keyof Window>(
  key: Key,
  value: Window[Key],
): void {
  Object.defineProperty(window, key, {
    configurable: true,
    value,
  });
}

describe('useEngineProject asset state', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: EngineProjectState | null;
  let importImage: ReturnType<typeof vi.fn>;
  let addBackground: ReturnType<typeof vi.fn>;
  let updateBackground: ReturnType<typeof vi.fn>;
  let deleteBackground: ReturnType<typeof vi.fn>;
  let reorderBackground: ReturnType<typeof vi.fn>;
  let deleteTimelineNodes: ReturnType<typeof vi.fn>;
  let reorderTimelineNode: ReturnType<typeof vi.fn>;
  let reorderTimelineNodes: ReturnType<typeof vi.fn>;

  function Harness() {
    current = useEngineProject();
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
    addBackground = vi.fn().mockResolvedValue(backgroundResult);
    updateBackground = vi.fn().mockResolvedValue(backgroundResult);
    deleteBackground = vi.fn().mockResolvedValue(backgroundResult);
    reorderBackground = vi.fn().mockResolvedValue(backgroundResult);
    deleteTimelineNodes = vi.fn().mockResolvedValue(backgroundResult);
    reorderTimelineNode = vi.fn().mockResolvedValue(backgroundResult);
    reorderTimelineNodes = vi.fn().mockResolvedValue(backgroundResult);

    exposeWindowApi(
      'vnEngine',
      {
        ensureProject: vi.fn().mockResolvedValue(initialResult),
        addBackground,
        updateBackground,
        deleteBackground,
        reorderBackground,
        deleteTimelineNodes,
        reorderTimelineNode,
        reorderTimelineNodes,
      } as unknown as Window['vnEngine'],
    );
    exposeWindowApi(
      'vnProjectFiles',
      {
        getSession: vi.fn().mockResolvedValue({
          filePath: '/projects/story/project.vn.json',
          ...initialResult.session,
        }),
      } as unknown as Window['vnProjectFiles'],
    );
    exposeWindowApi(
      'vnAssets',
      { importImage } as unknown as Window['vnAssets'],
    );
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
      filePath: '/projects/story/project.vn.json',
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
      filePath: '/projects/story/project.vn.json',
      ...importedResult.session,
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
