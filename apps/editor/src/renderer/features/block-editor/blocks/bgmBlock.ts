import * as Blockly from 'blockly';

export const BGM_BLOCK_TYPE = 'vn_bgm';

export const BGM_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
} as const;

const ASSET_DATA_PREFIX = 'vn-bgm-asset:';
const EMPTY_BGM_FIELD_VALUE = '\u00a0'.repeat(12);

export function setBgmBlockAsset(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data = assetId === null ? null : `${ASSET_DATA_PREFIX}${assetId}`;
  block.setFieldValue(
    displayName || EMPTY_BGM_FIELD_VALUE,
    BGM_BLOCK_FIELDS.assetName,
  );
}

export function getBgmBlockAssetId(
  block: Blockly.Block,
): string | null {
  return block.data?.startsWith(ASSET_DATA_PREFIX)
    ? block.data.slice(ASSET_DATA_PREFIX.length)
    : null;
}

export function registerBgmBlock(): void {
  if (Blockly.Blocks[BGM_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[BGM_BLOCK_TYPE] = {
    init(): void {
      const assetField = new Blockly.FieldTextInput(
        EMPTY_BGM_FIELD_VALUE,
        undefined,
        { spellcheck: false },
      );

      this.appendDummyInput()
        .appendField('切换背景音乐')
        .appendField(assetField, BGM_BLOCK_FIELDS.assetName);
      assetField.setEnabled(false);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip('从这里开始播放或停止背景音乐');
      this.setHelpUrl('');
    },
  };
}
