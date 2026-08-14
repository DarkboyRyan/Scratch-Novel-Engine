import * as Blockly from 'blockly';

export const VIDEO_BLOCK_TYPE = 'vn_video';

export const VIDEO_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
} as const;

const ASSET_DATA_PREFIX = 'vn-video-asset:';
const EMPTY_VIDEO_FIELD_VALUE = '\u00a0'.repeat(12);

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

export function registerVideoBlock(): void {
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
        .appendField('播放视频')
        .appendField(assetField, VIDEO_BLOCK_FIELDS.assetName);
      // The label must always represent an imported video Asset ID. Users
      // assign it by dragging a video from the shared resource panel.
      assetField.setEnabled(false);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(285);
      this.setTooltip('播放所选视频，播放结束后继续执行下一条剧情');
      this.setHelpUrl('');
    },
  };
}
