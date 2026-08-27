/**
 * 文件主要作用：验证 logic Blockly backend-first events 的行为。
 * 测试覆盖：`logic Blockly backend-first events`。
 */

import * as Blockly from 'blockly';
import { afterEach, describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import { getEditorLabels } from '../../src/renderer/i18n/editorLocalization';
import {
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  registerLogicControlBlocks,
  setLogicControlMarkers,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';
import {
  registerVariableBlocks,
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/variableBlock';
import { getTimelineBeforeNodeIdForBlock } from '../../src/renderer/features/block-editor/dialogueBlockEvents';
import {
  getLogicControlDeleteResolution,
  getLogicControlReorderResolution,
  getNewLogicBlockDrop,
} from '../../src/renderer/features/block-editor/logicBlockEvents';

function moveEvent(blockId: string): Blockly.Events.Abstract {
  return {
    type: Blockly.Events.BLOCK_MOVE,
    blockId,
    reason: ['drag'],
  } as unknown as Blockly.Events.Abstract;
}

function baseScene(nodes: SceneDocument['nodes']): SceneDocument {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Scene',
    backgroundAssetId: null,
    nodes,
  };
}

describe('logic Blockly backend-first events', () => {
  const workspaces: Blockly.Workspace[] = [];

  afterEach(() => {
    workspaces.splice(0).forEach((workspace) => workspace.dispose());
  });

  function workspace(): Blockly.Workspace {
    registerVariableBlocks(getEditorLabels('zh-CN'));
    registerLogicControlBlocks(getEditorLabels('zh-CN'));
    const value = new Blockly.Workspace();
    workspaces.push(value);
    return value;
  }

  it('anchors the last new child in empty Then, Else and Repeat bodies to hidden markers', () => {
    const value = workspace();
    const ifBlock = value.newBlock(LOGIC_IF_BLOCK_TYPE, 'if-1');
    setLogicControlMarkers(ifBlock, {
      kind: 'if',
      elseNodeId: 'else-1',
      endNodeId: 'endif-1',
    });
    const thenChild = value.newBlock(VARIABLE_SET_BLOCK_TYPE, 'new-then');
    const elseChild = value.newBlock(VARIABLE_SET_BLOCK_TYPE, 'new-else');
    ifBlock.getInput(LOGIC_CONTROL_INPUTS.then)?.connection?.connect(
      thenChild.previousConnection!,
    );
    ifBlock.getInput(LOGIC_CONTROL_INPUTS.else)?.connection?.connect(
      elseChild.previousConnection!,
    );

    const repeat = value.newBlock(LOGIC_REPEAT_BLOCK_TYPE, 'repeat-1');
    setLogicControlMarkers(repeat, {
      kind: 'repeat',
      endNodeId: 'endrepeat-1',
    });
    const bodyChild = value.newBlock(VARIABLE_CHANGE_BLOCK_TYPE, 'new-body');
    repeat.getInput(LOGIC_CONTROL_INPUTS.body)?.connection?.connect(
      bodyChild.previousConnection!,
    );
    const scene = baseScene([
      {
        id: 'if-1',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'score' },
          operator: 'eq',
          right: { kind: 'literal', value: 0 },
        },
      },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      { id: 'endif-1', type: 'logicEndIf', ifNodeId: 'if-1' },
      { id: 'repeat-1', type: 'logicRepeat', count: 2 },
      {
        id: 'endrepeat-1',
        type: 'logicEndRepeat',
        repeatNodeId: 'repeat-1',
      },
    ]);

    expect(
      getTimelineBeforeNodeIdForBlock(
        thenChild as Blockly.BlockSvg,
        scene,
      ),
    ).toBe('else-1');
    expect(
      getTimelineBeforeNodeIdForBlock(
        elseChild as Blockly.BlockSvg,
        scene,
      ),
    ).toBe('endif-1');
    expect(
      getTimelineBeforeNodeIdForBlock(
        bodyChild as Blockly.BlockSvg,
        scene,
      ),
    ).toBe('endrepeat-1');

    expect(
      getNewLogicBlockDrop(
        moveEvent(elseChild.id),
        value as Blockly.WorkspaceSvg,
        scene,
      ),
    ).toMatchObject({
      kind: 'variableSet',
      beforeNodeId: 'endif-1',
    });
  });

  it('does not persist a child nested in a temporary unpaired parent', () => {
    const value = workspace();
    const temporaryIf = value.newBlock(LOGIC_IF_BLOCK_TYPE, 'temporary-if');
    const child = value.newBlock(VARIABLE_SET_BLOCK_TYPE, 'temporary-child');
    temporaryIf.getInput(LOGIC_CONTROL_INPUTS.else)?.connection?.connect(
      child.previousConnection!,
    );
    const scene = baseScene([
      {
        id: 'line-1',
        type: 'dialogue',
        speaker: 'A',
        text: 'Existing',
        voiceAssetId: null,
      },
    ]);

    expect(
      getNewLogicBlockDrop(
        moveEvent(child.id),
        value as Blockly.WorkspaceSvg,
        scene,
      ),
    ).toBeNull();
  });

  it('reorders a complete nested control before the owning Else end marker', () => {
    const value = workspace();
    const outer = value.newBlock(LOGIC_IF_BLOCK_TYPE, 'outer-if');
    setLogicControlMarkers(outer, {
      kind: 'if',
      elseNodeId: 'outer-else',
      endNodeId: 'outer-end',
    });
    const inner = value.newBlock(LOGIC_REPEAT_BLOCK_TYPE, 'inner-repeat');
    setLogicControlMarkers(inner, {
      kind: 'repeat',
      endNodeId: 'inner-end',
    });
    outer.getInput(LOGIC_CONTROL_INPUTS.else)?.connection?.connect(
      inner.previousConnection!,
    );
    const scene = baseScene([
      {
        id: 'outer-if',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'flag' },
          operator: 'eq',
          right: { kind: 'literal', value: true },
        },
      },
      { id: 'outer-else', type: 'logicElse', ifNodeId: 'outer-if' },
      { id: 'outer-end', type: 'logicEndIf', ifNodeId: 'outer-if' },
      { id: 'inner-repeat', type: 'logicRepeat', count: 2 },
      {
        id: 'inner-end',
        type: 'logicEndRepeat',
        repeatNodeId: 'inner-repeat',
      },
    ]);

    expect(
      getLogicControlReorderResolution(
        moveEvent(inner.id),
        value as Blockly.WorkspaceSvg,
        scene,
      ),
    ).toEqual({
      kind: 'reorder',
      nodeId: 'inner-repeat',
      beforeNodeId: 'outer-end',
    });
  });

  it('deletes one selected control tree but rejects unrelated mixed selections', () => {
    const scene = baseScene([
      { id: 'repeat-1', type: 'logicRepeat', count: 2 },
      {
        id: 'line-inside',
        type: 'dialogue',
        speaker: 'A',
        text: 'Inside',
        voiceAssetId: null,
      },
      {
        id: 'repeat-end',
        type: 'logicEndRepeat',
        repeatNodeId: 'repeat-1',
      },
      {
        id: 'line-outside',
        type: 'dialogue',
        speaker: 'B',
        text: 'Outside',
        voiceAssetId: null,
      },
    ]);

    expect(
      getLogicControlDeleteResolution(scene, [
        'repeat-1',
        'line-inside',
      ]),
    ).toEqual({ kind: 'delete', nodeId: 'repeat-1' });
    expect(
      getLogicControlDeleteResolution(scene, [
        'repeat-1',
        'line-outside',
      ]),
    ).toEqual({ kind: 'reject-mixed-selection' });
  });
});
