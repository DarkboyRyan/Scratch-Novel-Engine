/**
 * 文件主要作用：解析人物立绘积木新增、字段更新和未失焦草稿。
 * 包含实现：`resolveNewCharacterPlacement`、`getCharacterFieldUpdate`、`collectCharacterFieldDrafts`。
 */

import * as Blockly from 'blockly';

import type {
  CharacterMode,
  CharacterPosition,
  CharacterSlot,
  SceneDocument,
} from '../../../shared/projectTypes';
import { DEFAULT_IMAGE_SCALE_PERCENT } from '../../../shared/projectTypes';
import {
  CHARACTER_BLOCK_FIELDS,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  getCharacterBlockAssetId,
  getCharacterBlockLayer,
  getCharacterBlockScalePercent,
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
  scalePercent: number;
};

export type CharacterFieldDrafts = {
  drafts: CharacterFieldUpdate[];
  invalidNodeId: string | null;
};

function readCharacterFieldUpdate(
  block: Blockly.Block,
  node: Extract<SceneDocument['nodes'][number], { type: 'character' }>,
): CharacterFieldUpdate | null {
  const isClear = block.type === CLEAR_CHARACTER_BLOCK_TYPE;
  const scalePercent = isClear
    ? DEFAULT_IMAGE_SCALE_PERCENT
    : getCharacterBlockScalePercent(block);
  if (scalePercent === null) {
    return null;
  }
  return {
    nodeId: node.id,
    mode: isClear ? 'clear' : 'show',
    assetId: isClear ? null : getCharacterBlockAssetId(block),
    slot:
      block.getFieldValue(CHARACTER_BLOCK_FIELDS.slot) === 'custom'
        ? node.slot
        : getCharacterBlockSlot(block),
    layer: getCharacterBlockLayer(block),
    position:
      block.getFieldValue(CHARACTER_BLOCK_FIELDS.slot) === 'custom'
        ? node.position
        : null,
    scalePercent,
  };
}

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
    (changeEvent.name !== CHARACTER_BLOCK_FIELDS.assetName &&
      changeEvent.name !== CHARACTER_BLOCK_FIELDS.slot &&
      changeEvent.name !== CHARACTER_BLOCK_FIELDS.layer &&
      changeEvent.name !== CHARACTER_BLOCK_FIELDS.scalePercent)
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

  return readCharacterFieldUpdate(block, node);
}

export function collectCharacterFieldDrafts(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): CharacterFieldDrafts {
  const drafts: CharacterFieldUpdate[] = [];
  for (const node of scene.nodes) {
    if (node.type !== 'character') {
      continue;
    }
    const block = workspace.getBlockById(node.id);
    if (!block || !isCharacterBlockType(block.type)) {
      continue;
    }
    const draft = readCharacterFieldUpdate(block, node);
    if (!draft) {
      return { drafts, invalidNodeId: node.id };
    }
    if (
      draft.mode !== node.mode ||
      draft.assetId !== node.assetId ||
      draft.slot !== node.slot ||
      draft.layer !== node.layer ||
      draft.scalePercent !== node.scalePercent ||
      (draft.position === null) !== (node.position === null) ||
      (draft.position !== null &&
        node.position !== null &&
        (draft.position.x !== node.position.x ||
          draft.position.y !== node.position.y))
    ) {
      drafts.push(draft);
    }
  }
  return { drafts, invalidNodeId: null };
}
