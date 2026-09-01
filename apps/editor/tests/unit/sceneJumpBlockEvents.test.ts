/**
 * 文件主要作用：验证 scene jump Blockly field events 的行为。
 * 测试覆盖：`scene jump Blockly field events`。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  SCENE_JUMP_BLOCK_FIELDS,
  SCENE_JUMP_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/sceneJumpBlock';
import { getSceneJumpFieldUpdate } from '../../src/renderer/features/block-editor/sceneJumpBlockEvents';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: '场景 1',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [{ id: 'jump-1', type: 'sceneJump', targetSceneId: 'scene-2' }],
};

describe('scene jump Blockly field events', () => {
  it('translates a persisted target dropdown change', () => {
    const event = {
      type: Blockly.Events.BLOCK_CHANGE,
      blockId: 'jump-1',
      element: 'field',
      name: SCENE_JUMP_BLOCK_FIELDS.targetScene,
    } as Blockly.Events.BlockChange;
    const workspace = {
      getBlockById: () => ({
        id: 'jump-1',
        type: SCENE_JUMP_BLOCK_TYPE,
        getFieldValue: () => 'scene-3',
      }),
    } as unknown as Blockly.WorkspaceSvg;

    expect(getSceneJumpFieldUpdate(event, workspace, scene)).toEqual({
      nodeId: 'jump-1',
      targetSceneId: 'scene-3',
    });
  });

  it('ignores temporary blocks and unrelated fields', () => {
    const workspace = {
      getBlockById: () => ({
        id: 'temporary',
        type: SCENE_JUMP_BLOCK_TYPE,
        getFieldValue: () => 'scene-2',
      }),
    } as unknown as Blockly.WorkspaceSvg;
    expect(getSceneJumpFieldUpdate({
      type: Blockly.Events.BLOCK_CHANGE,
      blockId: 'temporary',
      element: 'field',
      name: SCENE_JUMP_BLOCK_FIELDS.targetScene,
    } as Blockly.Events.BlockChange, workspace, scene)).toBeNull();
  });
});
