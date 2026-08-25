import * as Blockly from 'blockly';

import type {
  CharacterPosition,
  CharacterSlot,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  CHARACTER_BLOCK_FIELDS,
  getCharacterBlockAssetId,
  getCharacterBlockLayer,
  getCharacterBlockSlot,
  isCharacterBlockType,
} from './blocks/characterBlock';

export type CharacterFieldUpdate = {
  nodeId: string;
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
