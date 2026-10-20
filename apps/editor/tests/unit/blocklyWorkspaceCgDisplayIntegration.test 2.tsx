/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 BlocklyWorkspace CG-display action integration 的行为。
 * 测试覆盖：`BlocklyWorkspace CG-display action integration`。
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
  CG_DISPLAY_BLOCK_TYPE,
  CG_DISPLAY_FIELDS,
  CG_DISPLAY_INPUTS,
  getCgDisplayMarkers,
} from '../../src/renderer/features/block-editor/blocks/cgDisplayBlock';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import { BACKGROUND_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import {
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import { VIDEO_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/videoBlock';
import { CHOICE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import { LOGIC_IF_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/logicControlBlock';

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

const imageAssets: AssetDocument[] = [
  { id: 'cg-image', type: 'image', displayName: 'Morning CG' },
];

const emptyScene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: 'Scene 1',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [],
};

const cgScene: SceneDocument = {
  ...emptyScene,
  nodes: [
    {
      id: 'cg-display-1',
      type: 'cgDisplay',
      assetId: 'cg-image',
      leadInMs: 1250,
    },
    {
      id: 'cg-line-1',
      type: 'dialogue',
      speaker: 'Gregor',
      text: 'What happened?',
      voiceAssetId: null,
    },
    {
      id: 'cg-end-1',
      type: 'cgEndDisplay',
      cgDisplayNodeId: 'cg-display-1',
    },
    {
      id: 'tail-line',
      type: 'dialogue',
      speaker: 'Gregor',
      text: 'After CG',
      voiceAssetId: null,
    },
  ],
};

describe('BlocklyWorkspace CG-display action integration', () => {
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

  it('uses backend-first add/update/delete and projects the paired range as one C block', async () => {
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
    const addDialogue = vi.fn().mockResolvedValue(true);
    const addCgDisplay = vi.fn().mockResolvedValue(true);
    const updateCgDisplay = vi.fn().mockResolvedValue(false);
    const deleteCgDisplay = vi.fn().mockResolvedValue(true);
    const reorderCgDisplay = vi.fn().mockResolvedValue(true);
    const addBackground = vi.fn().mockResolvedValue(true);
    const addCharacter = vi.fn().mockResolvedValue(true);
    const addVideo = vi.fn().mockResolvedValue(true);
    const addChoice = vi.fn().mockResolvedValue(true);
    const addLogicIf = vi.fn().mockResolvedValue(true);
    const action = vi.fn().mockResolvedValue(true);

    const render = async (scene: SceneDocument) => {
      await act(async () => {
        root.render(
          <BlocklyWorkspace
            ref={editorRef}
            scene={scene}
            scenes={[scene]}
            assets={imageAssets}
            layoutKey={`project:${scene.id}`}
            layoutStore={new Map()}
            isBusy={false}
            onDialogueAdd={addDialogue}
            onBackgroundAdd={addBackground}
            onBackgroundUpdate={action}
            onCharacterAdd={addCharacter}
            onCharacterUpdate={action}
            onCharacterEffectUpdate={action}
            onCharacterEffectMove={action}
            onSceneJumpAdd={action}
            onSceneJumpUpdate={action}
            onBgmAdd={action}
            onBgmUpdate={action}
            onVideoAdd={addVideo}
            onVideoUpdate={action}
            onChoiceAdd={addChoice}
            onChoiceOptionAdd={action}
            onStoryExtensionAdd={action}
            onVariableSetAdd={action}
            onVariableSetUpdate={action}
            onVariableChangeAdd={action}
            onVariableChangeUpdate={action}
            onLogicIfAdd={addLogicIf}
            onLogicIfUpdate={action}
            onLogicRepeatAdd={action}
            onLogicRepeatUpdate={action}
            onLogicControlDelete={action}
            onLogicControlReorder={action}
            onCgDisplayAdd={addCgDisplay}
            onCgDisplayUpdate={updateCgDisplay}
            onCgDisplayDelete={deleteCgDisplay}
            onCgDisplayReorder={reorderCgDisplay}
            onChoiceOptionUpdate={action}
            onChoiceOptionDelete={action}
            onChoiceOptionReorder={action}
            onDialogueVoiceUpdate={action}
            onTimelineNodesDelete={action}
            onTimelineReorder={action}
            onTimelineNodesReorder={action}
            onDialogueUpdate={async () => true}
            onDraftDirtyChange={() => {}}
          />,
        );
        await Promise.resolve();
      });
    };

    await render(emptyScene);
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
    for (const [type, mode] of [
      [CHARACTER_BLOCK_TYPE, 'show'],
      [CLEAR_CHARACTER_BLOCK_TYPE, 'clear'],
    ] as const) {
      const temporaryCharacter = workspace.newBlock(
        type,
        `toolbox-${mode}-character`,
      );
      temporaryCharacter.initSvg();
      temporaryCharacter.render();
      await act(async () => {
        workspace.fireChangeListener(
          event(Blockly.Events.BLOCK_MOVE, {
            blockId: temporaryCharacter.id,
            reason: ['drag'],
          }),
        );
        await Promise.resolve();
      });
      expect(addCharacter).toHaveBeenLastCalledWith({
        sceneId: 'scene-1',
        beforeNodeId: null,
        mode,
        assetId: null,
      });
      await render({ ...emptyScene, nodes: [] });
    }

    const temporaryCg = workspace.newBlock(CG_DISPLAY_BLOCK_TYPE, 'toolbox-cg');
    temporaryCg.initSvg();
    temporaryCg.setFieldValue('1.25', CG_DISPLAY_FIELDS.leadInSeconds);
    temporaryCg.render();
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: temporaryCg.id,
          reason: ['drag'],
        }),
      );
      await Promise.resolve();
    });
    expect(addCgDisplay).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      assetId: 'cg-image',
      leadInMs: 1250,
      afterNodeId: null,
      beforeNodeId: null,
    });

    await render(cgScene);
    const projectedCg = workspace.getBlockById('cg-display-1');
    expect(projectedCg?.type).toBe(CG_DISPLAY_BLOCK_TYPE);
    expect(getCgDisplayMarkers(projectedCg!)).toEqual({
      endNodeId: 'cg-end-1',
    });
    expect(projectedCg?.getInputTargetBlock(CG_DISPLAY_INPUTS.body)?.id).toBe(
      'cg-line-1',
    );
    expect(workspace.getBlockById('cg-end-1')).toBeNull();

    for (const [type, addSpy] of [
      [BACKGROUND_BLOCK_TYPE, addBackground],
      [CHARACTER_BLOCK_TYPE, addCharacter],
      [VIDEO_BLOCK_TYPE, addVideo],
      [CHOICE_BLOCK_TYPE, addChoice],
      [LOGIC_IF_BLOCK_TYPE, addLogicIf],
      [CG_DISPLAY_BLOCK_TYPE, addCgDisplay],
    ] as const) {
      const callsBefore = addSpy.mock.calls.length;
      const invalid = workspace.newBlock(type, `invalid-${type}`);
      invalid.initSvg();
      invalid.render();
      workspace
        .getBlockById('cg-line-1')
        ?.nextConnection?.connect(invalid.previousConnection!);
      await act(async () => {
        workspace.fireChangeListener(
          event(Blockly.Events.BLOCK_MOVE, {
            blockId: invalid.id,
            reason: ['drag'],
          }),
        );
        await Promise.resolve();
      });
      expect(addSpy).toHaveBeenCalledTimes(callsBefore);
      expect(workspace.getBlockById(invalid.id)).toBeNull();
    }

    Blockly.Events.disable();
    workspace
      .getBlockById('cg-display-1')
      ?.setFieldValue('2.5', CG_DISPLAY_FIELDS.leadInSeconds);
    Blockly.Events.enable();
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_CHANGE, {
          blockId: 'cg-display-1',
          element: 'field',
          name: CG_DISPLAY_FIELDS.leadInSeconds,
        }),
      );
      await Promise.resolve();
    });
    expect(updateCgDisplay).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
      assetId: 'cg-image',
      leadInMs: 2500,
    });
    expect(
      workspace
        .getBlockById('cg-display-1')
        ?.getFieldValue(CG_DISPLAY_FIELDS.leadInSeconds),
    ).toBe(1.25);

    const projectedLine = workspace.getBlockById('cg-line-1');
    const newLine = workspace.newBlock(DIALOGUE_BLOCK_TYPE, 'toolbox-line');
    newLine.initSvg();
    newLine.render();
    projectedLine?.nextConnection?.connect(newLine.previousConnection!);
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: newLine.id,
          reason: ['drag'],
        }),
      );
      await Promise.resolve();
    });
    expect(addDialogue).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: 'scene-1',
        beforeNodeId: 'cg-end-1',
      }),
    );

    await render(cgScene);
    const cgToMove = workspace.getBlockById('cg-display-1');
    const tailLine = workspace.getBlockById('tail-line');
    if (!cgToMove?.previousConnection || !tailLine?.nextConnection) {
      throw new Error('Expected projected CG and tail connections');
    }
    cgToMove?.unplug(true);
    tailLine.nextConnection.connect(cgToMove.previousConnection);
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: 'cg-display-1',
          reason: ['drag'],
        }),
      );
      await Promise.resolve();
    });
    expect(reorderCgDisplay).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
      beforeNodeId: null,
    });

    await render(cgScene);
    workspace.fireChangeListener(
      event(Blockly.Events.SELECTED, {
        newElementId: 'cg-display-1',
      }),
    );
    await act(async () => {
      workspace.trashcan?.click();
      await Promise.resolve();
    });
    expect(deleteCgDisplay).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
    });

    await act(async () => root.unmount());
  }, 15_000);
});
