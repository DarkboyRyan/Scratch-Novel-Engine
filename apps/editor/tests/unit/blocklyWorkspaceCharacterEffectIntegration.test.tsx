/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 BlocklyWorkspace portrait-effect action integration 的行为。
 * 测试覆盖：`BlocklyWorkspace portrait-effect action integration`。
 */

import * as Blockly from 'blockly';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AssetDocument,
  SceneDocument,
} from '../../src/shared/projectTypes';
import {
  BlocklyWorkspace,
  type BlocklyWorkspaceHandle,
} from '../../src/renderer/features/block-editor/BlocklyWorkspace';
import {
  CHARACTER_BLOCK_INPUTS,
  CHARACTER_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import {
  CHARACTER_EFFECT_BLOCK_TYPES,
  CHARACTER_EFFECT_FIELDS,
  getCharacterEffectOwner,
} from '../../src/renderer/features/block-editor/blocks/characterEffectBlock';

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function event(
  type: string,
  values: Record<string, unknown>,
): Blockly.Events.Abstract {
  return { type, ...values } as unknown as Blockly.Events.Abstract;
}

const assets: AssetDocument[] = [
  { id: 'alice', type: 'image', displayName: 'Alice' },
  { id: 'bob', type: 'image', displayName: 'Bob' },
];

const shake = {
  type: 'shake',
  durationMs: 500,
  intensity: 'normal',
} as const;

function sceneWithEffects(
  firstEffect: typeof shake | null = shake,
  secondEffect: typeof shake | null = null,
): SceneDocument {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Scene 1',
    backgroundAssetId: null,
    nodes: [
      {
        id: 'portrait-a',
        type: 'character',
        mode: 'show',
        assetId: 'alice',
        slot: 'left',
        layer: 1,
        position: null,
        effect: firstEffect,
      },
      {
        id: 'portrait-b',
        type: 'character',
        mode: 'show',
        assetId: 'bob',
        slot: 'right',
        layer: 2,
        position: null,
        effect: secondEffect,
      },
    ],
  };
}

describe('BlocklyWorkspace portrait-effect action integration', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as CanvasRenderingContext2D);
    const svgPrototype = SVGElement.prototype as SVGElement & {
      getBBox?: () => { x: number; y: number; width: number; height: number };
    };
    if (!svgPrototype.getBBox) {
      Object.defineProperty(SVGElement.prototype, 'getBBox', {
        configurable: true,
        value: () => ({ x: 0, y: 0, width: 160, height: 60 }),
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('projects, edits, attaches, moves, and removes effects through dedicated actions', async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    container.style.width = '1000px';
    container.style.height = '700px';
    document.body.append(container);
    const root = createRoot(container);
    const editorRef = createRef<BlocklyWorkspaceHandle>();
    const updateEffect = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const moveEffect = vi.fn().mockResolvedValue(true);
    const action = vi.fn().mockResolvedValue(true);

    const render = async (scene: SceneDocument) => {
      await act(async () => {
        root.render(
          <BlocklyWorkspace
            ref={editorRef}
            scene={scene}
            scenes={[scene]}
            assets={assets}
            layoutKey={`project:${scene.id}`}
            layoutStore={new Map()}
            isBusy={false}
            onDialogueAdd={action}
            onBackgroundAdd={action}
            onBackgroundUpdate={action}
            onCharacterAdd={action}
            onCharacterUpdate={action}
            onCharacterEffectUpdate={updateEffect}
            onCharacterEffectMove={moveEffect}
            onSceneJumpAdd={action}
            onSceneJumpUpdate={action}
            onBgmAdd={action}
            onBgmUpdate={action}
            onVideoAdd={action}
            onVideoUpdate={action}
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
            onDialogueVoiceUpdate={action}
            onTimelineNodesDelete={action}
            onTimelineReorder={action}
            onTimelineNodesReorder={action}
            onDialogueUpdate={action}
            onDraftDirtyChange={() => {}}
          />,
        );
        await Promise.resolve();
      });
    };

    const originalScene = sceneWithEffects();
    await render(originalScene);
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
    const portraitA = workspace.getBlockById('portrait-a');
    const projected = workspace.getBlockById('portrait-a:effect');
    expect(portraitA?.type).toBe(CHARACTER_BLOCK_TYPE);
    expect(
      portraitA?.getInputTargetBlock(CHARACTER_BLOCK_INPUTS.effect)?.id,
    ).toBe('portrait-a:effect');
    expect(projected?.type).toBe(CHARACTER_EFFECT_BLOCK_TYPES.shake);
    expect(getCharacterEffectOwner(projected!)).toBe('portrait-a');
    const effectDragStrategy = (
      projected as Blockly.BlockSvg
    ).getDragStrategy() as unknown as {
      getSearchRadius(): number;
    };
    expect(effectDragStrategy.getSearchRadius()).toBeGreaterThan(
      Blockly.config.snapRadius,
    );
    Blockly.Events.disable();
    projected?.setFieldValue('0.75', CHARACTER_EFFECT_FIELDS.durationSeconds);
    Blockly.Events.enable();
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_CHANGE, {
          blockId: projected?.id,
          element: 'field',
          name: CHARACTER_EFFECT_FIELDS.durationSeconds,
        }),
      );
      await Promise.resolve();
    });
    expect(updateEffect).toHaveBeenNthCalledWith(1, {
      sceneId: 'scene-1',
      nodeId: 'portrait-a',
      effect: { ...shake, durationMs: 750 },
    });
    expect(
      workspace
        .getBlockById('portrait-a:effect')
        ?.getFieldValue(CHARACTER_EFFECT_FIELDS.durationSeconds),
    ).toBe(0.5);

    const fresh = workspace.newBlock(
      CHARACTER_EFFECT_BLOCK_TYPES.fadeIn,
      'toolbox-effect',
    );
    fresh.initSvg();
    fresh.render();
    const currentPortraitA = workspace.getBlockById('portrait-a');
    const currentPortraitB = workspace.getBlockById('portrait-b');
    expect(
      workspace.connectionChecker.canConnect(
        fresh.outputConnection,
        currentPortraitA?.getInput(CHARACTER_BLOCK_INPUTS.effect)?.connection ??
          null,
        true,
        Number.POSITIVE_INFINITY,
      ),
    ).toBe(false);
    currentPortraitB
      ?.getInput(CHARACTER_BLOCK_INPUTS.effect)
      ?.connection?.connect(fresh.outputConnection!);
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: fresh.id,
          newParentId: 'portrait-b',
          newInputName: CHARACTER_BLOCK_INPUTS.effect,
        }),
      );
      await Promise.resolve();
    });
    expect(updateEffect).toHaveBeenNthCalledWith(2, {
      sceneId: 'scene-1',
      nodeId: 'portrait-b',
      effect: { type: 'fadeIn', durationMs: 500 },
    });

    await render(originalScene);
    const effectToMove = workspace.getBlockById('portrait-a:effect');
    const targetConnection = workspace
      .getBlockById('portrait-b')
      ?.getInput(CHARACTER_BLOCK_INPUTS.effect)?.connection;
    if (!effectToMove?.outputConnection || !targetConnection) {
      throw new Error('Expected projected portrait effect connections');
    }
    effectToMove.unplug();
    targetConnection.connect(effectToMove.outputConnection);
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: 'portrait-a:effect',
          oldParentId: 'portrait-a',
          oldInputName: CHARACTER_BLOCK_INPUTS.effect,
          newParentId: 'portrait-b',
          newInputName: CHARACTER_BLOCK_INPUTS.effect,
        }),
      );
      await Promise.resolve();
    });
    expect(moveEffect).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      fromNodeId: 'portrait-a',
      toNodeId: 'portrait-b',
      effect: shake,
    });

    await render(sceneWithEffects(null, shake));
    workspace.fireChangeListener(
      event(Blockly.Events.SELECTED, {
        newElementId: 'portrait-b:effect',
      }),
    );
    await act(async () => {
      workspace.trashcan?.click();
      await Promise.resolve();
    });
    expect(updateEffect).toHaveBeenLastCalledWith({
      sceneId: 'scene-1',
      nodeId: 'portrait-b',
      effect: null,
    });

    await act(async () => root.unmount());
  }, 15_000);
});
