import * as Blockly from 'blockly';

import type {
  CharacterPosition,
  CharacterSlot,
} from '../../../../shared/projectTypes';

export const CHARACTER_BLOCK_TYPE = 'vn_character';
export const CLEAR_CHARACTER_BLOCK_TYPE = 'vn_clear_character';

export const CHARACTER_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
  slot: 'SLOT',
  layer: 'LAYER',
} as const;

const ASSET_DATA_PREFIX = 'vn-character-asset:';
const EMPTY_CHARACTER_FIELD_VALUE = '\u00a0'.repeat(12);
const CHARACTER_SLOT_OPTIONS: [string, string][] = [
  ['左侧', 'left'],
  ['中间', 'center'],
  ['右侧', 'right'],
];

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

export function setCharacterBlockPosition(
  block: Blockly.Block,
  slot: CharacterSlot,
  position: CharacterPosition | null,
): void {
  const field = block.getField(
    CHARACTER_BLOCK_FIELDS.slot,
  ) as Blockly.FieldDropdown | null;
  if (!field) {
    return;
  }
  field.setOptions([
    ...CHARACTER_SLOT_OPTIONS,
    ...(position ? [['自定义', 'custom'] as [string, string]] : []),
  ]);
  block.setFieldValue(
    position ? 'custom' : slot,
    CHARACTER_BLOCK_FIELDS.slot,
  );
}

export function getCharacterBlockLayer(block: Blockly.Block): number {
  const layer = Number(block.getFieldValue(CHARACTER_BLOCK_FIELDS.layer));
  return Number.isInteger(layer) && layer >= 1 && layer <= 10 ? layer : 1;
}

export function isCharacterBlockType(type: string): boolean {
  return (
    type === CHARACTER_BLOCK_TYPE || type === CLEAR_CHARACTER_BLOCK_TYPE
  );
}

function createLayerField(): Blockly.FieldDropdown {
  return new Blockly.FieldDropdown(
    Array.from({ length: 10 }, (_, index) => {
      const value = String(index + 1);
      return [value, value] as [string, string];
    }),
  );
}

export function registerCharacterBlock(): void {
  if (!Blockly.Blocks[CHARACTER_BLOCK_TYPE]) {
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
              ...CHARACTER_SLOT_OPTIONS,
            ]),
            CHARACTER_BLOCK_FIELDS.slot,
          )
          .appendField('层级')
          .appendField(
            createLayerField(),
            CHARACTER_BLOCK_FIELDS.layer,
          );

        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(285);
        this.setTooltip('显示或替换一个人物立绘层');
        this.setHelpUrl('');
      },
    };
  }

  if (!Blockly.Blocks[CLEAR_CHARACTER_BLOCK_TYPE]) {
    Blockly.Blocks[CLEAR_CHARACTER_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField('清除立绘')
          .appendField('层级')
          .appendField(
            createLayerField(),
            CHARACTER_BLOCK_FIELDS.layer,
          );

        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(330);
        this.setTooltip('从画面中清除指定层级的人物立绘');
        this.setHelpUrl('');
      },
    };
  }
}
