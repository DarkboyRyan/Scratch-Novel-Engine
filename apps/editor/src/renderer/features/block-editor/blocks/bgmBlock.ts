import * as Blockly from 'blockly';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';

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
  block.setTooltip(labels.blockly.bgmTooltip);
}

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

export function registerBgmBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
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
        .appendField(currentLabels.blockly.bgm, LABEL_FIELD)
        .appendField(assetField, BGM_BLOCK_FIELDS.assetName);
      assetField.setEnabled(false);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip(currentLabels.blockly.bgmTooltip);
      this.setHelpUrl('');
    },
  };
}
