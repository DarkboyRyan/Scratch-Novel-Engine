import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VnEngineApi } from '../../src/shared/engineProtocol';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electron.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

describe('preload background and timeline engine API', () => {
  let engine: VnEngineApi;

  beforeAll(async () => {
    await import('../../src/preload');
    const exposure = electron.exposeInMainWorld.mock.calls.find(
      ([name]) => name === 'vnEngine',
    );

    if (!exposure) {
      throw new Error('preload did not expose vnEngine');
    }
    engine = exposure[1] as VnEngineApi;
  });

  beforeEach(() => {
    electron.invoke.mockReset();
    electron.invoke.mockResolvedValue({});
  });

  it.each([
    [
      'addBackground',
      {
        sceneId: 'scene-1',
        afterNodeId: 'dialogue-1',
      },
      'background.add',
    ],
    [
      'updateBackground',
      {
        sceneId: 'scene-1',
        nodeId: 'background-1',
        assetId: 'asset-2',
      },
      'background.update',
    ],
    [
      'deleteBackground',
      { sceneId: 'scene-1', nodeId: 'background-1' },
      'background.delete',
    ],
    [
      'reorderBackground',
      {
        sceneId: 'scene-1',
        nodeId: 'background-1',
        beforeNodeId: null,
      },
      'background.reorder',
    ],
    [
      'addCharacter',
      {
        sceneId: 'scene-1',
        afterNodeId: 'dialogue-1',
      },
      'character.add',
    ],
    [
      'updateCharacter',
      {
        sceneId: 'scene-1',
        nodeId: 'character-1',
        assetId: 'asset-2',
        slot: 'right',
        layer: 3,
      },
      'character.update',
    ],
    [
      'addSceneJump',
      {
        sceneId: 'scene-1',
        targetSceneId: 'scene-2',
        afterNodeId: 'dialogue-1',
      },
      'sceneJump.add',
    ],
    [
      'updateSceneJump',
      {
        sceneId: 'scene-1',
        nodeId: 'jump-1',
        targetSceneId: 'scene-3',
      },
      'sceneJump.update',
    ],
    [
      'deleteTimelineNodes',
      {
        sceneId: 'scene-1',
        nodeIds: ['dialogue-1', 'background-1'],
      },
      'timeline.deleteMany',
    ],
    [
      'reorderTimelineNode',
      {
        sceneId: 'scene-1',
        nodeId: 'background-1',
        beforeNodeId: 'dialogue-2',
      },
      'timeline.reorder',
    ],
    [
      'reorderTimelineNodes',
      {
        sceneId: 'scene-1',
        nodeIds: ['dialogue-1', 'background-1'],
        beforeNodeId: null,
      },
      'timeline.reorderMany',
    ],
  ] as const)(
    'forwards %s only through the engine request channel',
    async (apiMethod, params, backendMethod) => {
      const invoke = engine[apiMethod] as (
        value: typeof params,
      ) => Promise<unknown>;

      await invoke(params);

      expect(electron.invoke).toHaveBeenCalledWith(
        'vn-engine:request',
        {
          method: backendMethod,
          params,
        },
      );
    },
  );
});
