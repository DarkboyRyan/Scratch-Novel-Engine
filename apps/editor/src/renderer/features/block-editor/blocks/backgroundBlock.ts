import * as Blockly from 'blockly';

export const BACKGROUND_BLOCK_TYPE = 'vn_background';

export const BACKGROUND_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
} as const;

const ASSET_DATA_PREFIX = 'vn-background-asset:';
// Non-breaking spaces keep an empty, visible drop slot at a useful width.
// The field is disabled below, so its text can only be changed by dropping an
// imported image onto the block.
const EMPTY_BACKGROUND_FIELD_VALUE = '\u00a0'.repeat(12);

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

export function registerBackgroundBlock(): void {
  if (Blockly.Blocks[BACKGROUND_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[BACKGROUND_BLOCK_TYPE] = {
    init(): void {
      const assetField = new Blockly.FieldTextInput(
        EMPTY_BACKGROUND_FIELD_VALUE,
        undefined,
        { spellcheck: false },
      );

      this.appendDummyInput()
        .appendField('切换背景')
        .appendField(assetField, BACKGROUND_BLOCK_FIELDS.assetName);
      // Retain the familiar white text-field shape without allowing users to
      // type a display name that is not backed by an imported Asset ID.
      assetField.setEnabled(false);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip('从这里开始切换背景，直到下一个背景积木');
      this.setHelpUrl('');
    },
  };
}
