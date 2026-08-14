import * as Blockly from 'blockly';

import type { CharacterSlot } from '../../../../shared/projectTypes';

export const CHARACTER_BLOCK_TYPE = 'vn_character';

export const CHARACTER_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
  slot: 'SLOT',
  layer: 'LAYER',
} as const;

const ASSET_DATA_PREFIX = 'vn-character-asset:';
const EMPTY_CHARACTER_FIELD_VALUE = '\u00a0'.repeat(12);

export function setCharacterBlockAsset(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data = assetId === null ? null : `${ASSET_DATA_PREFIX}${assetId}`;
  block.setFieldValue(
    displayName || EMPTY_CHARACTER_FIELD_VALUE,
    CHARACTER_BLOCK_FIELDS.assetName,
  );
}

export function getCharacterBlockAssetId(
  block: Blockly.Block,
): string | null {
  return block.data?.startsWith(ASSET_DATA_PREFIX)
    ? block.data.slice(ASSET_DATA_PREFIX.length)
    : null;
}

export function getCharacterBlockSlot(block: Blockly.Block): CharacterSlot {
  const slot = block.getFieldValue(CHARACTER_BLOCK_FIELDS.slot);
  return slot === 'left' || slot === 'right' ? slot : 'center';
}

export function getCharacterBlockLayer(block: Blockly.Block): number {
  const layer = Number(block.getFieldValue(CHARACTER_BLOCK_FIELDS.layer));
  return Number.isInteger(layer) && layer >= 1 && layer <= 10 ? layer : 1;
}

export function registerCharacterBlock(): void {
  if (Blockly.Blocks[CHARACTER_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[CHARACTER_BLOCK_TYPE] = {
    init(): void {
      const assetField = new Blockly.FieldTextInput(
        EMPTY_CHARACTER_FIELD_VALUE,
        undefined,
        { spellcheck: false },
      );

      this.appendDummyInput()
        .appendField('人物立绘')
        .appendField(assetField, CHARACTER_BLOCK_FIELDS.assetName);
      assetField.setEnabled(false);

      this.appendDummyInput()
        .appendField('位置')
        .appendField(
          new Blockly.FieldDropdown([
            ['左侧', 'left'],
            ['中间', 'center'],
            ['右侧', 'right'],
          ]),
          CHARACTER_BLOCK_FIELDS.slot,
        )
        .appendField('层级')
        .appendField(
          new Blockly.FieldDropdown(
            Array.from({ length: 10 }, (_, index) => {
              const value = String(index + 1);
              return [value, value] as [string, string];
            }),
          ),
          CHARACTER_BLOCK_FIELDS.layer,
        );

      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(285);
      this.setTooltip('显示、替换或清空一个人物立绘层');
      this.setHelpUrl('');
    },
  };
}
