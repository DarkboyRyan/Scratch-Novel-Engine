/**
 * 文件主要作用：注册人物立绘和清除立绘积木并读写位置、图片与缩放。
 * 包含实现：人物资源/位置/层级/缩放访问器、HMR 旧实例字段升级和积木注册。
 */

import * as Blockly from 'blockly';

import type {
  CharacterPosition,
  CharacterSlot,
} from '../../../../shared/projectTypes';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
} from '../../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../../i18n/editorLocalization';
import { CHARACTER_EFFECT_CONNECTION_TYPE } from './characterEffectBlock';
import {
  AssetNameField,
  ensureAssetNameField,
} from './assetNameField';

export const CHARACTER_BLOCK_TYPE = 'vn_character';
export const CLEAR_CHARACTER_BLOCK_TYPE = 'vn_clear_character';

export const CHARACTER_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
  slot: 'SLOT',
  layer: 'LAYER',
  scalePercent: 'SCALE_PERCENT',
} as const;

export const CHARACTER_BLOCK_INPUTS = {
  effect: 'EFFECT',
} as const;

const ASSET_DATA_PREFIX = 'vn-character-asset:';
const LABEL_FIELDS = {
  character: 'VN_LABEL_CHARACTER',
  position: 'VN_LABEL_POSITION',
  effect: 'VN_LABEL_EFFECT',
  layer: 'VN_LABEL_LAYER',
  scale: 'VN_LABEL_SCALE',
  clear: 'VN_LABEL_CLEAR_CHARACTER',
  clearLayer: 'VN_LABEL_CLEAR_LAYER',
} as const;
const SCALE_INPUT = 'VN_CHARACTER_SCALE_INPUT';
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
    ensureCharacterScaleField(block, DEFAULT_IMAGE_SCALE_PERCENT);
    block.setFieldValue(labels.blockly.characterEffect, LABEL_FIELDS.effect);
    block.setFieldValue(labels.blockly.position, LABEL_FIELDS.position);
    block.setFieldValue(labels.blockly.scale, LABEL_FIELDS.scale);
    ensureAssetNameField(
      block,
      CHARACTER_BLOCK_FIELDS.assetName,
      labels.common.none,
      'image',
      getCharacterBlockAssetId(block),
      labels.common.missingImage,
    );
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
  const assetField = typeof block.getField === 'function'
    ? block.getField(CHARACTER_BLOCK_FIELDS.assetName)
    : null;
  if (assetField instanceof AssetNameField) {
    assetField.setAssetValue(assetId, displayName);
  } else {
    block.setFieldValue(
      displayName || currentLabels.common.none,
      CHARACTER_BLOCK_FIELDS.assetName,
    );
  }
}

export function getCharacterBlockAssetId(block: Blockly.Block): string | null {
  const assetField = typeof block.getField === 'function'
    ? block.getField(CHARACTER_BLOCK_FIELDS.assetName)
    : null;
  if (assetField instanceof AssetNameField) {
    return assetField.getAssetId();
  }
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
    ...(position
      ? [[currentLabels.blockly.custom, 'custom'] as [string, string]]
      : []),
  ]);
  block.setFieldValue(position ? 'custom' : slot, CHARACTER_BLOCK_FIELDS.slot);
}

export function getCharacterBlockLayer(block: Blockly.Block): number {
  const layer = Number(block.getFieldValue(CHARACTER_BLOCK_FIELDS.layer));
  return Number.isInteger(layer) && layer >= 1 && layer <= 10 ? layer : 1;
}

export function setCharacterBlockScalePercent(
  block: Blockly.Block,
  scalePercent: number,
): void {
  ensureCharacterScaleField(block, scalePercent).setValue(scalePercent);
}

function ensureCharacterScaleField(
  block: Blockly.Block,
  initialValue: number,
): Blockly.FieldNumber {
  let field = block.getField(CHARACTER_BLOCK_FIELDS.scalePercent);
  if (field === null) {
    const input = block.getInput(SCALE_INPUT) ??
      block.appendDummyInput(SCALE_INPUT);
    if (block.getField(LABEL_FIELDS.scale) === null) {
      input.appendField(currentLabels.blockly.scale, LABEL_FIELDS.scale);
    }
    input
      .appendField(
        new Blockly.FieldNumber(
          initialValue,
          MIN_IMAGE_SCALE_PERCENT,
          MAX_IMAGE_SCALE_PERCENT,
          1,
        ),
        CHARACTER_BLOCK_FIELDS.scalePercent,
      )
      .appendField('%');
    field = block.getField(CHARACTER_BLOCK_FIELDS.scalePercent);
  }
  if (!(field instanceof Blockly.FieldNumber)) {
    throw new Error('character scale field is not a number input');
  }
  field.setConstraints(
    MIN_IMAGE_SCALE_PERCENT,
    MAX_IMAGE_SCALE_PERCENT,
    1,
  );
  return field;
}

export function getCharacterBlockScalePercent(
  block: Blockly.Block,
): number | null {
  if (block.type === CLEAR_CHARACTER_BLOCK_TYPE) {
    return DEFAULT_IMAGE_SCALE_PERCENT;
  }
  const value = Number(
    block.getFieldValue(CHARACTER_BLOCK_FIELDS.scalePercent),
  );
  return Number.isInteger(value) &&
    value >= MIN_IMAGE_SCALE_PERCENT &&
    value <= MAX_IMAGE_SCALE_PERCENT
    ? value
    : null;
}

export function isCharacterBlockType(type: string): boolean {
  return type === CHARACTER_BLOCK_TYPE || type === CLEAR_CHARACTER_BLOCK_TYPE;
}

function createLayerField(): Blockly.FieldDropdown {
  return new Blockly.FieldDropdown(
    Array.from({ length: 10 }, (_, index) => {
      const value = String(index + 1);
      return [value, value] as [string, string];
    }),
  );
}

export function registerCharacterBlock(
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  // Blockly's global registry survives Renderer HMR. Replace the managed show
  // definition; projection still upgrades already-instantiated stale blocks.
  Blockly.Blocks[CHARACTER_BLOCK_TYPE] = {
    init(): void {
      const assetField = new AssetNameField(
        currentLabels.common.none,
        'image',
      );

      this.appendValueInput(CHARACTER_BLOCK_INPUTS.effect)
        .setCheck(CHARACTER_EFFECT_CONNECTION_TYPE)
        .appendField(currentLabels.blockly.character, LABEL_FIELDS.character)
        .appendField(assetField, CHARACTER_BLOCK_FIELDS.assetName)
        .appendField(
          currentLabels.blockly.characterEffect,
          LABEL_FIELDS.effect,
        );
      this.appendDummyInput()
        .appendField(currentLabels.blockly.position, LABEL_FIELDS.position)
        .appendField(
          new Blockly.FieldDropdown([...characterSlotOptions(currentLabels)]),
          CHARACTER_BLOCK_FIELDS.slot,
        )
        .appendField(currentLabels.blockly.layer, LABEL_FIELDS.layer)
        .appendField(createLayerField(), CHARACTER_BLOCK_FIELDS.layer)
        .appendField(currentLabels.blockly.scale, LABEL_FIELDS.scale)
        .appendField(
          new Blockly.FieldNumber(
            DEFAULT_IMAGE_SCALE_PERCENT,
            MIN_IMAGE_SCALE_PERCENT,
            MAX_IMAGE_SCALE_PERCENT,
            1,
          ),
          CHARACTER_BLOCK_FIELDS.scalePercent,
        )
        .appendField('%');

      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(285);
      this.setTooltip(currentLabels.blockly.characterTooltip);
      this.setHelpUrl('');
    },
  };

  if (!Blockly.Blocks[CLEAR_CHARACTER_BLOCK_TYPE]) {
    Blockly.Blocks[CLEAR_CHARACTER_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField(currentLabels.blockly.clearCharacter, LABEL_FIELDS.clear)
          .appendField(currentLabels.blockly.layer, LABEL_FIELDS.clearLayer)
          .appendField(createLayerField(), CHARACTER_BLOCK_FIELDS.layer);

        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(330);
        this.setTooltip(currentLabels.blockly.clearCharacterTooltip);
        this.setHelpUrl('');
      },
    };
  }
}
