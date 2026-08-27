/**
 * 文件主要作用：解析人物立绘积木新增、更新、移动和资源选择事件。
 * 包含实现：`resolveNewCharacterPlacement`、`CharacterFieldUpdate`、`getCharacterFieldUpdate`。
 */

import * as Blockly from 'blockly';

import type {
  CharacterMode,
  CharacterPosition,
  CharacterSlot,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  CHARACTER_BLOCK_FIELDS,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  getCharacterBlockAssetId,
  getCharacterBlockLayer,
  getCharacterBlockSlot,
  isCharacterBlockType,
} from './blocks/characterBlock';

/**
 * Resolve the authoring intent written by a newly dropped portrait block.
 * A normal portrait starts as a valid image-less `show` placeholder; only the
 * dedicated clear block writes `clear`. Keeping these states distinct stops a
 * new portrait from being reprojected as “clear portrait”.
 */
export function resolveNewCharacterPlacement(
  blockType: string,
): { mode: CharacterMode; assetId: null } | undefined {
  if (blockType === CLEAR_CHARACTER_BLOCK_TYPE) {
    return { mode: 'clear', assetId: null };
  }
  if (blockType === CHARACTER_BLOCK_TYPE) {
    return { mode: 'show', assetId: null };
  }
  return undefined;
}

export type CharacterFieldUpdate = {
  nodeId: string;
  mode: CharacterMode;
  assetId: string | null;
  slot: CharacterSlot;
  layer: number;
  position: CharacterPosition | null;
};

export function getCharacterFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): CharacterFieldUpdate | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }

  const changeEvent = event as Blockly.Events.BlockChange;
  if (
    changeEvent.element !== 'field' ||
    !changeEvent.blockId ||
    (changeEvent.name !== CHARACTER_BLOCK_FIELDS.slot &&
      changeEvent.name !== CHARACTER_BLOCK_FIELDS.layer)
  ) {
    return null;
  }

  const node = scene.nodes.find(
    (candidate) => candidate.id === changeEvent.blockId,
  );
  const block = workspace.getBlockById(changeEvent.blockId);
  if (
    node?.type !== 'character' ||
    !block ||
    !isCharacterBlockType(block.type)
  ) {
    return null;
  }

  return {
    nodeId: node.id,
    mode: block.type === CLEAR_CHARACTER_BLOCK_TYPE ? 'clear' : 'show',
    assetId: getCharacterBlockAssetId(block),
    slot:
      block.getFieldValue(CHARACTER_BLOCK_FIELDS.slot) === 'custom'
        ? node.slot
        : getCharacterBlockSlot(block),
    layer: getCharacterBlockLayer(block),
    position:
      block.getFieldValue(CHARACTER_BLOCK_FIELDS.slot) === 'custom'
        ? node.position
        : null,
  };
}
