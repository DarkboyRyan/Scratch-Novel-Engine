/**
 * 文件主要作用：注册视频积木并读写视频资源和播放设置。
 * 包含实现：`VIDEO_BLOCK_TYPE`、`VIDEO_BLOCK_FIELDS`、`applyVideoBlockLocalization`、`setVideoBlockAsset`、`getVideoBlockAssetId`、`registerVideoBlock`。
 */

import * as Blockly from 'blockly';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';

export const VIDEO_BLOCK_TYPE = 'vn_video';

export const VIDEO_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
} as const;

const ASSET_DATA_PREFIX = 'vn-video-asset:';
const EMPTY_VIDEO_FIELD_VALUE = '\u00a0'.repeat(12);
const LABEL_FIELD = 'VN_LABEL_VIDEO';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

export function applyVideoBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  block.setFieldValue(labels.blockly.video, LABEL_FIELD);
  block.setTooltip(labels.blockly.videoTooltip);
}

export function setVideoBlockAsset(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data = assetId === null ? null : `${ASSET_DATA_PREFIX}${assetId}`;
  block.setFieldValue(
    displayName || EMPTY_VIDEO_FIELD_VALUE,
    VIDEO_BLOCK_FIELDS.assetName,
  );
}

export function getVideoBlockAssetId(
  block: Blockly.Block,
): string | null {
  return block.data?.startsWith(ASSET_DATA_PREFIX)
    ? block.data.slice(ASSET_DATA_PREFIX.length)
    : null;
}

export function registerVideoBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  if (Blockly.Blocks[VIDEO_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[VIDEO_BLOCK_TYPE] = {
    init(): void {
      const assetField = new Blockly.FieldTextInput(
        EMPTY_VIDEO_FIELD_VALUE,
        undefined,
        { spellcheck: false },
      );

      this.appendDummyInput()
        .appendField(currentLabels.blockly.video, LABEL_FIELD)
        .appendField(assetField, VIDEO_BLOCK_FIELDS.assetName);
      // The label must always represent an imported video Asset ID. Users
      // assign it by dragging a video from the shared resource panel.
      assetField.setEnabled(false);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(285);
      this.setTooltip(currentLabels.blockly.videoTooltip);
      this.setHelpUrl('');
    },
  };
}
