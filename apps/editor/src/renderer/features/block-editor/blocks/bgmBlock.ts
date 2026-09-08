/**
 * 文件主要作用：注册背景音乐积木并读写音频资源与播放参数。
 * 包含实现：`BGM_BLOCK_TYPE`、`BGM_BLOCK_FIELDS`、`applyBgmBlockLocalization`、`setBgmBlockAsset`、`getBgmBlockAssetId`、`registerBgmBlock`。
 */

import * as Blockly from 'blockly';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';
import {
  AssetNameField,
  ensureAssetNameField,
} from './assetNameField';

export const BGM_BLOCK_TYPE = 'vn_bgm';

export const BGM_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
} as const;

const ASSET_DATA_PREFIX = 'vn-bgm-asset:';
const EMPTY_BGM_FIELD_VALUE = '\u00a0'.repeat(12);
const LABEL_FIELD = 'VN_LABEL_BGM';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

export function applyBgmBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  block.setFieldValue(labels.blockly.bgm, LABEL_FIELD);
  ensureAssetNameField(
    block,
    BGM_BLOCK_FIELDS.assetName,
    labels.scenes.stopBackgroundMusic,
    'audio',
    getBgmBlockAssetId(block),
    labels.common.missingAudio,
  );
  block.setTooltip(labels.blockly.bgmTooltip);
}

export function setBgmBlockAsset(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data = assetId === null ? null : `${ASSET_DATA_PREFIX}${assetId}`;
  const assetField = typeof block.getField === 'function'
    ? block.getField(BGM_BLOCK_FIELDS.assetName)
    : null;
  if (assetField instanceof AssetNameField) {
    assetField.setAssetValue(assetId, displayName);
  } else {
    block.setFieldValue(
      displayName || EMPTY_BGM_FIELD_VALUE,
      BGM_BLOCK_FIELDS.assetName,
    );
  }
}

export function getBgmBlockAssetId(
  block: Blockly.Block,
): string | null {
  const assetField = typeof block.getField === 'function'
    ? block.getField(BGM_BLOCK_FIELDS.assetName)
    : null;
  if (assetField instanceof AssetNameField) {
    return assetField.getAssetId();
  }
  return block.data?.startsWith(ASSET_DATA_PREFIX)
    ? block.data.slice(ASSET_DATA_PREFIX.length)
    : null;
}

export function registerBgmBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  Blockly.Blocks[BGM_BLOCK_TYPE] = {
    init(): void {
      const assetField = new AssetNameField(
        currentLabels.scenes.stopBackgroundMusic,
        'audio',
      );

      this.appendDummyInput()
        .appendField(currentLabels.blockly.bgm, LABEL_FIELD)
        .appendField(assetField, BGM_BLOCK_FIELDS.assetName);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip(currentLabels.blockly.bgmTooltip);
      this.setHelpUrl('');
    },
  };
}
