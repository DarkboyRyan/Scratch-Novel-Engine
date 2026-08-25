import * as Blockly from 'blockly';

import type {
  CharacterPosition,
  CharacterSlot,
} from '../../../../shared/projectTypes';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';

export const CHARACTER_BLOCK_TYPE = 'vn_character';
export const CLEAR_CHARACTER_BLOCK_TYPE = 'vn_clear_character';

export const CHARACTER_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
  slot: 'SLOT',
  layer: 'LAYER',
} as const;

const ASSET_DATA_PREFIX = 'vn-character-asset:';
const EMPTY_CHARACTER_FIELD_VALUE = '\u00a0'.repeat(12);
const LABEL_FIELDS = {
  character: 'VN_LABEL_CHARACTER',
  position: 'VN_LABEL_POSITION',
  layer: 'VN_LABEL_LAYER',
  clear: 'VN_LABEL_CLEAR_CHARACTER',
  clearLayer: 'VN_LABEL_CLEAR_LAYER',
} as const;
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

function characterSlotOptions(labels: EditorLabels): [string, string][] {
  return [
    [labels.blockly.left, 'left'],
    [labels.blockly.center, 'center'],
    [labels.blockly.right, 'right'],
  ];
}

export function applyCharacterBlockLocalization(
  block: Blockly.Block,
  labels: EditorLabels,
): void {
  const isClear = block.type === CLEAR_CHARACTER_BLOCK_TYPE;
  block.setFieldValue(
    isClear ? labels.blockly.clearCharacter : labels.blockly.character,
    isClear ? LABEL_FIELDS.clear : LABEL_FIELDS.character,
  );
  block.setFieldValue(
    labels.blockly.layer,
    isClear ? LABEL_FIELDS.clearLayer : LABEL_FIELDS.layer,
  );
  if (!isClear) {
    block.setFieldValue(labels.blockly.position, LABEL_FIELDS.position);
    const field = block.getField(CHARACTER_BLOCK_FIELDS.slot);
    if (field instanceof Blockly.FieldDropdown) {
      const value = String(field.getValue());
      field.setOptions([
        ...characterSlotOptions(labels),
        ...(value === 'custom'
          ? [[labels.blockly.custom, 'custom'] as [string, string]]
          : []),
      ]);
      field.setValue(value);
    }
  }
  block.setTooltip(
    isClear
      ? labels.blockly.clearCharacterTooltip
      : labels.blockly.characterTooltip,
  );
}

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
    ...characterSlotOptions(currentLabels),
    ...(position ? [[currentLabels.blockly.custom, 'custom'] as [string, string]] : []),
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

export function registerCharacterBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  if (!Blockly.Blocks[CHARACTER_BLOCK_TYPE]) {
    Blockly.Blocks[CHARACTER_BLOCK_TYPE] = {
      init(): void {
        const assetField = new Blockly.FieldTextInput(
          EMPTY_CHARACTER_FIELD_VALUE,
          undefined,
          { spellcheck: false },
        );

        this.appendDummyInput()
          .appendField(currentLabels.blockly.character, LABEL_FIELDS.character)
          .appendField(assetField, CHARACTER_BLOCK_FIELDS.assetName);
        assetField.setEnabled(false);

        this.appendDummyInput()
          .appendField(currentLabels.blockly.position, LABEL_FIELDS.position)
          .appendField(
            new Blockly.FieldDropdown([
              ...characterSlotOptions(currentLabels),
            ]),
            CHARACTER_BLOCK_FIELDS.slot,
          )
          .appendField(currentLabels.blockly.layer, LABEL_FIELDS.layer)
          .appendField(
            createLayerField(),
            CHARACTER_BLOCK_FIELDS.layer,
          );

        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(285);
        this.setTooltip(currentLabels.blockly.characterTooltip);
        this.setHelpUrl('');
      },
    };
  }

  if (!Blockly.Blocks[CLEAR_CHARACTER_BLOCK_TYPE]) {
    Blockly.Blocks[CLEAR_CHARACTER_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField(currentLabels.blockly.clearCharacter, LABEL_FIELDS.clear)
          .appendField(currentLabels.blockly.layer, LABEL_FIELDS.clearLayer)
          .appendField(
            createLayerField(),
            CHARACTER_BLOCK_FIELDS.layer,
          );

        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(330);
        this.setTooltip(currentLabels.blockly.clearCharacterTooltip);
        this.setHelpUrl('');
      },
    };
  }
}
