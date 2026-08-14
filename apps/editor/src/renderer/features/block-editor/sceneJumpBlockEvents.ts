import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import {
  SCENE_JUMP_BLOCK_FIELDS,
  SCENE_JUMP_BLOCK_TYPE,
} from './blocks/sceneJumpBlock';

export type SceneJumpFieldUpdate = {
  nodeId: string;
  targetSceneId: string;
};

export function getSceneJumpFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): SceneJumpFieldUpdate | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }
  const change = event as Blockly.Events.BlockChange;
  if (
    change.element !== 'field' ||
    change.name !== SCENE_JUMP_BLOCK_FIELDS.targetScene ||
    !change.blockId
  ) {
    return null;
  }
  const block = workspace.getBlockById(change.blockId);
  const node = scene.nodes.find((candidate) => candidate.id === change.blockId);
  if (block?.type !== SCENE_JUMP_BLOCK_TYPE || node?.type !== 'sceneJump') {
    return null;
  }
  const targetSceneId = String(
    block.getFieldValue(SCENE_JUMP_BLOCK_FIELDS.targetScene) ?? '',
  );
  return targetSceneId ? { nodeId: node.id, targetSceneId } : null;
}
