/**
 * 文件主要作用：注册背景积木并读写背景资源、缩放与本地化标签。
 * 包含实现：背景资源/缩放访问器、HMR 旧实例字段升级和 `registerBackgroundBlock`。
 */

import * as Blockly from 'blockly';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
} from '../../../../shared/projectTypes';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';
import {
  AssetNameField,
  ensureAssetNameField,
} from './assetNameField';

export const BACKGROUND_BLOCK_TYPE = 'vn_background';

export const BACKGROUND_BLOCK_FIELDS = {
  assetName: 'ASSET_NAME',
  scalePercent: 'SCALE_PERCENT',
} as const;

const ASSET_DATA_PREFIX = 'vn-background-asset:';
// Non-breaking spaces keep an empty, visible drop slot at a useful width.
// The field is disabled below, so its text can only be changed by dropping an
// imported image onto the block.
const EMPTY_BACKGROUND_FIELD_VALUE = '\u00a0'.repeat(12);
const LABEL_FIELD = 'VN_LABEL_BACKGROUND';
const SCALE_LABEL_FIELD = 'VN_LABEL_SCALE';
const SCALE_INPUT = 'VN_BACKGROUND_SCALE_INPUT';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

export function applyBackgroundBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  ensureBackgroundScaleField(
    block,
    DEFAULT_IMAGE_SCALE_PERCENT,
  ).setEnabled(getBackgroundBlockAssetId(block) !== null);
  block.setFieldValue(labels.blockly.background, LABEL_FIELD);
  block.setFieldValue(labels.blockly.scale, SCALE_LABEL_FIELD);
  ensureAssetNameField(
    block,
    BACKGROUND_BLOCK_FIELDS.assetName,
    labels.resource.noBackground,
    'image',
    getBackgroundBlockAssetId(block),
    labels.common.missingImage,
  );
  block.setTooltip(labels.blockly.backgroundTooltip);
}

export function setBackgroundBlockAsset(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data = assetId === null ? null : `${ASSET_DATA_PREFIX}${assetId}`;
  const assetField = typeof block.getField === 'function'
    ? block.getField(BACKGROUND_BLOCK_FIELDS.assetName)
    : null;
  if (assetField instanceof AssetNameField) {
    assetField.setAssetValue(assetId, displayName);
  } else {
    block.setFieldValue(
      displayName || EMPTY_BACKGROUND_FIELD_VALUE,
      BACKGROUND_BLOCK_FIELDS.assetName,
    );
  }
  const scaleField = ensureBackgroundScaleField(
    block,
    DEFAULT_IMAGE_SCALE_PERCENT,
  );
  scaleField.setEnabled(assetId !== null);
  if (assetId === null) {
    block.setFieldValue(
      String(DEFAULT_IMAGE_SCALE_PERCENT),
      BACKGROUND_BLOCK_FIELDS.scalePercent,
    );
  }
}

export function getBackgroundBlockAssetId(
  block: Blockly.Block,
): string | null {
  const assetField = typeof block.getField === 'function'
    ? block.getField(BACKGROUND_BLOCK_FIELDS.assetName)
    : null;
  if (assetField instanceof AssetNameField) {
    return assetField.getAssetId();
  }
  return block.data?.startsWith(ASSET_DATA_PREFIX)
    ? block.data.slice(ASSET_DATA_PREFIX.length)
    : null;
}

export function getBackgroundBlockScalePercent(
  block: Blockly.Block,
): number | null {
  const value = Number(
    block.getFieldValue(BACKGROUND_BLOCK_FIELDS.scalePercent),
  );
  return Number.isInteger(value) &&
    value >= MIN_IMAGE_SCALE_PERCENT &&
    value <= MAX_IMAGE_SCALE_PERCENT
    ? value
    : null;
}

export function setBackgroundBlockScalePercent(
  block: Blockly.Block,
  scalePercent: number,
): void {
  ensureBackgroundScaleField(block, scalePercent).setValue(scalePercent);
}

function ensureBackgroundScaleField(
  block: Blockly.Block,
  initialValue: number,
): Blockly.FieldNumber {
  let field = block.getField(BACKGROUND_BLOCK_FIELDS.scalePercent);
  if (field === null) {
    const input = block.getInput(SCALE_INPUT) ??
      block.appendDummyInput(SCALE_INPUT);
    if (block.getField(SCALE_LABEL_FIELD) === null) {
      input.appendField(currentLabels.blockly.scale, SCALE_LABEL_FIELD);
    }
    input
      .appendField(
        new Blockly.FieldNumber(
          initialValue,
          MIN_IMAGE_SCALE_PERCENT,
          MAX_IMAGE_SCALE_PERCENT,
          1,
        ),
        BACKGROUND_BLOCK_FIELDS.scalePercent,
      )
      .appendField('%');
    field = block.getField(BACKGROUND_BLOCK_FIELDS.scalePercent);
  }
  if (!(field instanceof Blockly.FieldNumber)) {
    throw new Error('background scale field is not a number input');
  }
  field.setConstraints(
    MIN_IMAGE_SCALE_PERCENT,
    MAX_IMAGE_SCALE_PERCENT,
    1,
  );
  return field;
}

export function registerBackgroundBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  // Blockly's global registry survives Renderer HMR. Replace our managed
  // definition so blocks created after a hot reload receive new fields.
  Blockly.Blocks[BACKGROUND_BLOCK_TYPE] = {
    init(): void {
      const assetField = new AssetNameField(
        currentLabels.resource.noBackground,
        'image',
      );
      const scaleField = new Blockly.FieldNumber(
        DEFAULT_IMAGE_SCALE_PERCENT,
        MIN_IMAGE_SCALE_PERCENT,
        MAX_IMAGE_SCALE_PERCENT,
        1,
      );
      scaleField.setEnabled(false);

      this.appendDummyInput()
        .appendField(currentLabels.blockly.background, LABEL_FIELD)
        .appendField(assetField, BACKGROUND_BLOCK_FIELDS.assetName);
      this.appendDummyInput(SCALE_INPUT)
        .appendField(currentLabels.blockly.scale, SCALE_LABEL_FIELD)
        .appendField(scaleField, BACKGROUND_BLOCK_FIELDS.scalePercent)
        .appendField('%');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip(currentLabels.blockly.backgroundTooltip);
      this.setHelpUrl('');
    },
  };
}
