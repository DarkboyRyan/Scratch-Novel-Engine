/**
 * 文件主要作用：解析背景积木的缩放字段并收集尚未失焦的缩放草稿。
 * 包含实现：`BackgroundFieldUpdate`、`getBackgroundFieldUpdate`、`collectBackgroundFieldDrafts`。
 */

import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import { DEFAULT_IMAGE_SCALE_PERCENT } from '../../../shared/projectTypes';
import {
  BACKGROUND_BLOCK_FIELDS,
  BACKGROUND_BLOCK_TYPE,
  getBackgroundBlockAssetId,
  getBackgroundBlockScalePercent,
} from './blocks/backgroundBlock';

export type BackgroundFieldUpdate = {
  nodeId: string;
  assetId: string | null;
  scalePercent: number;
};

export type BackgroundFieldDrafts = {
  drafts: BackgroundFieldUpdate[];
  invalidNodeId: string | null;
};

function readBackgroundFieldUpdate(
  block: Blockly.Block,
  nodeId: string,
): BackgroundFieldUpdate | null {
  const assetId = getBackgroundBlockAssetId(block);
  const scalePercent = assetId === null
    ? DEFAULT_IMAGE_SCALE_PERCENT
    : getBackgroundBlockScalePercent(block);
  return scalePercent === null
    ? null
    : { nodeId, assetId, scalePercent };
}

export function getBackgroundFieldUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): BackgroundFieldUpdate | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }
  const changeEvent = event as Blockly.Events.BlockChange;
  if (
    changeEvent.element !== 'field' ||
    changeEvent.name !== BACKGROUND_BLOCK_FIELDS.scalePercent ||
    !changeEvent.blockId
  ) {
    return null;
  }
  const node = scene.nodes.find(
    (candidate) => candidate.id === changeEvent.blockId,
  );
  const block = workspace.getBlockById(changeEvent.blockId);
  if (node?.type !== 'background' || block?.type !== BACKGROUND_BLOCK_TYPE) {
    return null;
  }
  return readBackgroundFieldUpdate(block, node.id);
}

export function collectBackgroundFieldDrafts(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): BackgroundFieldDrafts {
  const drafts: BackgroundFieldUpdate[] = [];
  for (const node of scene.nodes) {
    if (node.type !== 'background') {
      continue;
    }
    const block = workspace.getBlockById(node.id);
    if (!block || block.type !== BACKGROUND_BLOCK_TYPE) {
      continue;
    }
    const draft = readBackgroundFieldUpdate(block, node.id);
    if (!draft) {
      return { drafts, invalidNodeId: node.id };
    }
    if (
      draft.assetId !== node.assetId ||
      draft.scalePercent !== node.scalePercent
    ) {
      drafts.push(draft);
    }
  }
  return { drafts, invalidNodeId: null };
}
