/**
 * 文件主要作用：注册背景积木并读写背景资源和本地化标签。
 * 包含实现：`BACKGROUND_BLOCK_TYPE`、`BACKGROUND_BLOCK_FIELDS`、`applyBackgroundBlockLocalization`、`setBackgroundBlockAsset`、`getBackgroundBlockAssetId`、`registerBackgroundBlock`。
 */

import * as Blockly from 'blockly';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';
import { AssetNameField } from './assetNameField';

export const BACKGROUND_BLOCK_TYPE = 'vn_background';

export const BACKGROUND_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
} as const;

const ASSET_DATA_PREFIX = 'vn-background-asset:';
// Non-breaking spaces keep an empty, visible drop slot at a useful width.
// The field is disabled below, so its text can only be changed by dropping an
// imported image onto the block.
const EMPTY_BACKGROUND_FIELD_VALUE = '\u00a0'.repeat(12);
const LABEL_FIELD = 'VN_LABEL_BACKGROUND';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

export function applyBackgroundBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  block.setFieldValue(labels.blockly.background, LABEL_FIELD);
  block.setTooltip(labels.blockly.backgroundTooltip);
}

export function setBackgroundBlockAsset(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data = assetId === null ? null : `${ASSET_DATA_PREFIX}${assetId}`;
  block.setFieldValue(
    displayName || EMPTY_BACKGROUND_FIELD_VALUE,
    BACKGROUND_BLOCK_FIELDS.assetName,
  );
}

export function getBackgroundBlockAssetId(
  block: Blockly.Block,
): string | null {
  return block.data?.startsWith(ASSET_DATA_PREFIX)
    ? block.data.slice(ASSET_DATA_PREFIX.length)
    : null;
}

export function registerBackgroundBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  if (Blockly.Blocks[BACKGROUND_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[BACKGROUND_BLOCK_TYPE] = {
    init(): void {
      const assetField = new AssetNameField(EMPTY_BACKGROUND_FIELD_VALUE);

      this.appendDummyInput()
        .appendField(currentLabels.blockly.background, LABEL_FIELD)
        .appendField(assetField, BACKGROUND_BLOCK_FIELDS.assetName);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip(currentLabels.blockly.backgroundTooltip);
      this.setHelpUrl('');
    },
  };
}
