/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Blockly 资源搜索字段会调用既有后端优先更新命令。
 * 测试覆盖：背景、立绘、对白语音、BGM 和视频的类型化选择。
 */

import * as Blockly from 'blockly';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BlocklyWorkspace } from '../../src/renderer/features/block-editor/BlocklyWorkspace';
import { AssetNameField } from '../../src/renderer/features/block-editor/blocks/assetNameField';
import {
  BACKGROUND_BLOCK_FIELDS,
} from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import {
  BGM_BLOCK_FIELDS,
} from '../../src/renderer/features/block-editor/blocks/bgmBlock';
import {
  CHARACTER_BLOCK_FIELDS,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import {
  DIALOGUE_BLOCK_FIELDS,
} from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import {
  VIDEO_BLOCK_FIELDS,
} from '../../src/renderer/features/block-editor/blocks/videoBlock';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import type {
  AssetDocument,
  SceneDocument,
} from '../../src/shared/projectTypes';

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const assets: AssetDocument[] = [
  { id: 'image-room', type: 'image', displayName: 'Room.png' },
  { id: 'audio-theme', type: 'audio', displayName: 'Theme.ogg' },
  { id: 'video-opening', type: 'video', displayName: 'Opening.mp4' },
];

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-assets',
  name: 'Assets',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [
    {
      id: 'background-node',
      type: 'background',
      assetId: null,
      scalePercent: 100,
    },
    {
      id: 'character-node',
      type: 'character',
      mode: 'show',
      assetId: null,
      slot: 'left',
      layer: 1,
      position: null,
      effect: null,
      scalePercent: 100,
    },
    {
      id: 'dialogue-node',
      type: 'dialogue',
      speaker: 'Alice',
      text: 'Hello',
      voiceAssetId: null,
    },
    { id: 'bgm-node', type: 'bgm', assetId: null },
    { id: 'video-node', type: 'video', assetId: null },
  ],
};

describe('BlocklyWorkspace asset selection integration', () => {
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as CanvasRenderingContext2D);
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 120, height: 40 }),
    });
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    container.style.width = '1000px';
    container.style.height = '700px';
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('routes each selected Asset ID through its existing update action', async () => {
    const action = vi.fn().mockResolvedValue(true);
    const updateBackground = vi.fn().mockResolvedValue(true);
    const updateCharacter = vi.fn().mockResolvedValue(true);
    const updateDialogueVoice = vi.fn().mockResolvedValue(true);
    const updateBgm = vi.fn().mockResolvedValue(true);
    const updateVideo = vi.fn().mockResolvedValue(true);

    await act(async () => {
      root.render(
        <EditorI18nProvider language="zh-CN">
          <BlocklyWorkspace
            scene={scene}
            scenes={[scene]}
            assets={assets}
            layoutKey="project:scene-assets"
            layoutStore={new Map()}
            isBusy={false}
            onDialogueAdd={action}
            onBackgroundAdd={action}
            onBackgroundUpdate={updateBackground}
            onCharacterAdd={action}
            onCharacterUpdate={updateCharacter}
            onCharacterEffectUpdate={action}
            onCharacterEffectMove={action}
            onSceneJumpAdd={action}
            onSceneJumpUpdate={action}
            onBgmAdd={action}
            onBgmUpdate={updateBgm}
            onVideoAdd={action}
            onVideoUpdate={updateVideo}
            onChoiceAdd={action}
            onChoiceOptionAdd={action}
            onStoryExtensionAdd={action}
            onVariableSetAdd={action}
            onVariableSetUpdate={action}
            onVariableChangeAdd={action}
            onVariableChangeUpdate={action}
            onLogicIfAdd={action}
            onLogicIfUpdate={action}
            onLogicRepeatAdd={action}
            onLogicRepeatUpdate={action}
            onLogicControlDelete={action}
            onLogicControlReorder={action}
            onCgDisplayAdd={action}
            onCgDisplayUpdate={action}
            onCgDisplayDelete={action}
            onCgDisplayReorder={action}
            onChoiceOptionUpdate={action}
            onChoiceOptionDelete={action}
            onChoiceOptionReorder={action}
            onDialogueVoiceUpdate={updateDialogueVoice}
            onTimelineNodesDelete={action}
            onTimelineReorder={action}
            onTimelineNodesReorder={action}
            onDialogueUpdate={action}
            onDraftDirtyChange={() => {}}
          />
        </EditorI18nProvider>,
      );
      await Promise.resolve();
    });

    const workspace = Blockly.getMainWorkspace();
    const selectAsset = async (
      blockId: string,
      fieldName: string,
      assetId: string,
      expectedAction: ReturnType<typeof vi.fn>,
    ) => {
      const field = workspace
        .getBlockById(blockId)
        ?.getField(fieldName);
      expect(field).toBeInstanceOf(AssetNameField);
      await act(async () => {
        field?.setValue(assetId);
        await vi.waitFor(() => expect(expectedAction).toHaveBeenCalledOnce());
      });
    };

    await selectAsset(
      'background-node',
      BACKGROUND_BLOCK_FIELDS.assetName,
      'image-room',
      updateBackground,
    );
    expect(updateBackground).toHaveBeenLastCalledWith({
      sceneId: 'scene-assets',
      nodeId: 'background-node',
      assetId: 'image-room',
      scalePercent: 100,
    });

    await selectAsset(
      'character-node',
      CHARACTER_BLOCK_FIELDS.assetName,
      'image-room',
      updateCharacter,
    );
    expect(updateCharacter).toHaveBeenLastCalledWith({
      sceneId: 'scene-assets',
      nodeId: 'character-node',
      mode: 'show',
      assetId: 'image-room',
      slot: 'left',
      layer: 1,
      position: null,
      scalePercent: 100,
    });

    await selectAsset(
      'dialogue-node',
      DIALOGUE_BLOCK_FIELDS.voiceAssetName,
      'audio-theme',
      updateDialogueVoice,
    );
    expect(updateDialogueVoice).toHaveBeenLastCalledWith({
      sceneId: 'scene-assets',
      nodeId: 'dialogue-node',
      assetId: 'audio-theme',
    });

    await selectAsset(
      'bgm-node',
      BGM_BLOCK_FIELDS.assetName,
      'audio-theme',
      updateBgm,
    );
    expect(updateBgm).toHaveBeenLastCalledWith({
      sceneId: 'scene-assets',
      nodeId: 'bgm-node',
      assetId: 'audio-theme',
    });

    await selectAsset(
      'video-node',
      VIDEO_BLOCK_FIELDS.assetName,
      'video-opening',
      updateVideo,
    );
    expect(updateVideo).toHaveBeenLastCalledWith({
      sceneId: 'scene-assets',
      nodeId: 'video-node',
      assetId: 'video-opening',
    });
  }, 15_000);
});
