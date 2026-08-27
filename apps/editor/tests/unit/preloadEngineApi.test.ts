/**
 * 文件主要作用：验证 preload background and timeline engine API 的行为。
 * 测试覆盖：`preload background and timeline engine API`。
 */

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

  it('forwards fixed CG pages through the engine channel', async () => {
    const pages = [{
      imageAssetIds: ['image-2', null, 'image-1', null, null, null, null, null, null],
    }];
    await engine.updateCgGallery(pages);

    expect(electron.invoke).toHaveBeenCalledWith(
      'vn-engine:request',
      {
        method: 'cgGallery.update',
        params: { pages },
      },
    );
  });

  it.each([
    [
      'updateStartScreen',
      {
        title: 'Custom title',
        eyebrow: 'A CUSTOM STORY',
        backgroundAssetId: 'background-1',
        musicAssetId: 'music-1',
      },
      'startScreen.update',
    ],
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
      'updateCharacterEffect',
      {
        sceneId: 'scene-1',
        nodeId: 'character-1',
        effect: { type: 'fadeIn', durationMs: 500 },
      },
      'characterEffect.update',
    ],
    [
      'moveCharacterEffect',
      {
        sceneId: 'scene-1',
        fromNodeId: 'character-1',
        toNodeId: 'character-2',
        effect: { type: 'shake', durationMs: 500, intensity: 'normal' },
      },
      'characterEffect.move',
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
      'addCgDisplay',
      {
        sceneId: 'scene-1',
        assetId: 'cg-1',
        leadInMs: 1500,
        beforeNodeId: 'dialogue-2',
      },
      'cgDisplay.add',
    ],
    [
      'updateCgDisplay',
      {
        sceneId: 'scene-1',
        nodeId: 'cg-display-1',
        assetId: 'cg-2',
        leadInMs: 250,
      },
      'cgDisplay.update',
    ],
    [
      'deleteCgDisplay',
      { sceneId: 'scene-1', nodeId: 'cg-display-1' },
      'cgDisplay.delete',
    ],
    [
      'reorderCgDisplay',
      {
        sceneId: 'scene-1',
        nodeId: 'cg-display-1',
        beforeNodeId: null,
      },
      'cgDisplay.reorder',
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
      'addStoryExtension',
      {
        sceneId: 'scene-1',
        beforeNodeId: 'dialogue-2',
      },
      'storyExtension.add',
    ],
    [
      'addVariableSet',
      {
        sceneId: 'scene-1',
        variableName: 'score',
        value: 3,
        beforeNodeId: 'dialogue-2',
      },
      'variableSet.add',
    ],
    [
      'updateVariableSet',
      {
        sceneId: 'scene-1',
        nodeId: 'set-1',
        variableName: 'route',
        value: 'good',
      },
      'variableSet.update',
    ],
    [
      'addVariableChange',
      { sceneId: 'scene-1', variableName: 'score', amount: 1 },
      'variableChange.add',
    ],
    [
      'updateVariableChange',
      {
        sceneId: 'scene-1',
        nodeId: 'change-1',
        variableName: 'score',
        amount: -2,
      },
      'variableChange.update',
    ],
    [
      'addLogicIf',
      {
        sceneId: 'scene-1',
        condition: {
          left: { kind: 'variable', name: 'score' },
          operator: 'gte',
          right: { kind: 'literal', value: 3 },
        },
      },
      'logicIf.add',
    ],
    [
      'updateLogicIf',
      {
        sceneId: 'scene-1',
        nodeId: 'if-1',
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'good' },
        },
      },
      'logicIf.update',
    ],
    [
      'addLogicRepeat',
      { sceneId: 'scene-1', count: 3 },
      'logicRepeat.add',
    ],
    [
      'updateLogicRepeat',
      { sceneId: 'scene-1', nodeId: 'repeat-1', count: 5 },
      'logicRepeat.update',
    ],
    [
      'deleteLogicControl',
      { sceneId: 'scene-1', nodeId: 'if-1' },
      'logicControl.delete',
    ],
    [
      'reorderLogicControl',
      { sceneId: 'scene-1', nodeId: 'repeat-1', beforeNodeId: null },
      'logicControl.reorder',
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

  it('forwards a pathless Web Player export on its dedicated channel', async () => {
    await gameExport.exportGame({ output: 'web-player' });

    expect(electron.invoke).toHaveBeenCalledWith(
      'vn-game-export:request',
      { action: 'export', params: { output: 'web-player' } },
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
