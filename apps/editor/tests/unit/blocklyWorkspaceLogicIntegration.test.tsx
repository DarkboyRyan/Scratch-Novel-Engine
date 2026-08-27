/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 BlocklyWorkspace logic action integration 的行为。
 * 测试覆盖：`BlocklyWorkspace logic action integration`。
 */

import * as Blockly from 'blockly';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  BlocklyWorkspace,
  type BlocklyWorkspaceHandle,
} from '../../src/renderer/features/block-editor/BlocklyWorkspace';
import {
  LOGIC_CONTROL_FIELDS,
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  getLogicControlMarkers,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';

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

const emptyScene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: 'Scene 1',
  backgroundAssetId: null,
  nodes: [],
};

const logicScene: SceneDocument = {
  ...emptyScene,
  nodes: [
    {
      id: 'if-1',
      type: 'logicIf',
      condition: {
        left: { kind: 'variable', name: 'score' },
        operator: 'eq',
        right: { kind: 'literal', value: 0 },
      },
    },
    {
      id: 'then-line',
      type: 'dialogue',
      speaker: 'A',
      text: 'Then',
      voiceAssetId: null,
    },
    { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
    { id: 'endif-1', type: 'logicEndIf', ifNodeId: 'if-1' },
  ],
};

describe('BlocklyWorkspace logic action integration', () => {
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
        value: () => ({ x: 0, y: 0, width: 120, height: 40 }),
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('routes add, failed update, C-block delete and empty Else insertion through backend-first actions', async () => {
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
    const addLogicIf = vi.fn().mockResolvedValue(true);
    const updateLogicIf = vi.fn().mockResolvedValue(false);
    const deleteLogicControl = vi.fn().mockResolvedValue(true);
    const reorderTimeline = vi.fn().mockResolvedValue(true);
    const action = vi.fn().mockResolvedValue(true);

    const render = async (scene: SceneDocument) => {
      await act(async () => {
        root.render(
          <BlocklyWorkspace
            ref={editorRef}
            scene={scene}
            scenes={[scene]}
            assets={[]}
            layoutKey={`project:${scene.id}`}
            layoutStore={new Map()}
            isBusy={false}
            onDialogueAdd={addDialogue}
            onBackgroundAdd={action}
            onBackgroundUpdate={action}
            onCharacterAdd={action}
            onCharacterUpdate={action}
            onCharacterEffectUpdate={action}
            onCharacterEffectMove={action}
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
            onLogicIfAdd={addLogicIf}
            onLogicIfUpdate={updateLogicIf}
            onLogicRepeatAdd={action}
            onLogicRepeatUpdate={action}
            onLogicControlDelete={deleteLogicControl}
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
            onTimelineReorder={reorderTimeline}
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
    if (!(workspace instanceof Blockly.WorkspaceSvg)) {
      throw new Error('Blockly workspace was not injected');
    }

    const temporaryIf = workspace.newBlock(LOGIC_IF_BLOCK_TYPE, 'toolbox-if');
    temporaryIf.initSvg();
    temporaryIf.render();
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: temporaryIf.id,
          reason: ['drag'],
        }),
      );
      await Promise.resolve();
    });
    expect(addLogicIf).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      beforeNodeId: null,
      condition: {
        left: { kind: 'variable', name: 'score' },
        operator: 'eq',
        right: { kind: 'literal', value: 0 },
      },
    });

    await render(logicScene);
    const projectedIf = workspace.getBlockById('if-1');
    expect(getLogicControlMarkers(projectedIf!)).toEqual({
      kind: 'if',
      elseNodeId: 'else-1',
      endNodeId: 'endif-1',
    });

    const thenLine = workspace.getBlockById('then-line');
    if (
      projectedIf === null ||
      thenLine === null ||
      thenLine.previousConnection === null
    ) {
      throw new Error('Expected projected logic blocks');
    }
    thenLine.unplug(true);
    projectedIf
      .getInput(LOGIC_CONTROL_INPUTS.else)
      ?.connection?.connect(thenLine.previousConnection);
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: 'then-line',
          reason: ['drag'],
        }),
      );
      await Promise.resolve();
    });
    expect(reorderTimeline).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'then-line',
      beforeNodeId: 'endif-1',
    });

    Blockly.Events.disable();
    projectedIf?.setFieldValue('neq', LOGIC_CONTROL_FIELDS.operator);
    Blockly.Events.enable();
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_CHANGE, {
          blockId: 'if-1',
          element: 'field',
          name: LOGIC_CONTROL_FIELDS.operator,
        }),
      );
      await Promise.resolve();
    });
    expect(updateLogicIf).toHaveBeenCalled();
    expect(
      workspace
        .getBlockById('if-1')
        ?.getFieldValue(LOGIC_CONTROL_FIELDS.operator),
    ).toBe('eq');

    const dialogue = workspace.newBlock(DIALOGUE_BLOCK_TYPE, 'toolbox-line');
    dialogue.initSvg();
    dialogue.render();
    workspace
      .getBlockById('if-1')
      ?.getInput(LOGIC_CONTROL_INPUTS.else)
      ?.connection?.connect(dialogue.previousConnection!);
    await act(async () => {
      workspace.fireChangeListener(
        event(Blockly.Events.BLOCK_MOVE, {
          blockId: dialogue.id,
          reason: ['drag'],
        }),
      );
      await Promise.resolve();
    });
    expect(addDialogue).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: 'scene-1',
        beforeNodeId: 'endif-1',
      }),
    );

    workspace.fireChangeListener(
      event(Blockly.Events.SELECTED, {
        newElementId: 'if-1',
      }),
    );
    await act(async () => {
      workspace.trashcan?.click();
      await Promise.resolve();
    });
    expect(deleteLogicControl).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'if-1',
    });

    await act(async () => root.unmount());
  });
});
