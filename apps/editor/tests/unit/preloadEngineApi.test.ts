import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VnEngineApi } from '../../src/shared/engineProtocol';
import type { VnGameExportApi } from '../../src/shared/exportProtocol';

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
  let gameExport: VnGameExportApi;

  beforeAll(async () => {
    await import('../../src/preload');
    const exposure = electron.exposeInMainWorld.mock.calls.find(
      ([name]) => name === 'vnEngine',
    );

    if (!exposure) {
      throw new Error('preload did not expose vnEngine');
    }
    engine = exposure[1] as VnEngineApi;

    const exportExposure = electron.exposeInMainWorld.mock.calls.find(
      ([name]) => name === 'vnGameExport',
    );
    if (!exportExposure) {
      throw new Error('preload did not expose vnGameExport');
    }
    gameExport = exportExposure[1] as VnGameExportApi;
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
      'setDialogueVoice',
      {
        sceneId: 'scene-1',
        nodeId: 'dialogue-1',
        assetId: 'voice-1',
      },
      'dialogue.setVoice',
    ],
    [
      'addBgm',
      {
        sceneId: 'scene-1',
        afterNodeId: 'dialogue-1',
      },
      'bgm.add',
    ],
    [
      'updateBgm',
      {
        sceneId: 'scene-1',
        nodeId: 'bgm-1',
        assetId: null,
      },
      'bgm.update',
    ],
    [
      'addVideo',
      {
        sceneId: 'scene-1',
        afterNodeId: 'dialogue-1',
      },
      'video.add',
    ],
    [
      'updateVideo',
      {
        sceneId: 'scene-1',
        nodeId: 'video-node-1',
        assetId: 'video-1',
      },
      'video.update',
    ],
    [
      'addChoice',
      {
        sceneId: 'scene-1',
        afterNodeId: 'dialogue-1',
      },
      'choice.add',
    ],
    [
      'addChoiceOption',
      {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        text: '前往天台',
        targetSceneId: 'scene-2',
        beforeOptionId: null,
      },
      'choice.option.add',
    ],
    [
      'updateChoiceOption',
      {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        optionId: 'option-1',
        text: '留在教室',
        targetSceneId: 'scene-3',
      },
      'choice.option.update',
    ],
    [
      'deleteChoiceOption',
      {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        optionId: 'option-1',
      },
      'choice.option.delete',
    ],
    [
      'reorderChoiceOption',
      {
        sceneId: 'scene-1',
        nodeId: 'choice-1',
        optionId: 'option-2',
        beforeOptionId: 'option-1',
      },
      'choice.option.reorder',
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

  it('forwards pathless export options on its dedicated channel', async () => {
    await gameExport.exportGame({ output: 'runtime-bundle' });

    expect(electron.invoke).toHaveBeenCalledWith(
      'vn-game-export:request',
      { action: 'export', params: { output: 'runtime-bundle' } },
    );
  });

  it('forwards standalone metadata without accepting an output path', async () => {
    await gameExport.exportGame({
      output: 'standalone-application',
      application: {
        name: 'Story',
        version: '1.0.0',
        applicationId: 'com.example.story',
      },
    });

    expect(electron.invoke).toHaveBeenCalledWith(
      'vn-game-export:request',
      {
        action: 'export',
        params: {
          output: 'standalone-application',
          application: {
            name: 'Story',
            version: '1.0.0',
            applicationId: 'com.example.story',
          },
        },
      },
    );
  });
});
