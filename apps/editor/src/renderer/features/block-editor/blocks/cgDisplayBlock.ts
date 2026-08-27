/**
 * 文件主要作用：注册可容纳对白的 CG 显示积木并读写图片与前置时长。
 * 包含实现：`CG_DISPLAY_BLOCK_TYPE`、`CG_DISPLAY_INPUTS`、`CG_DISPLAY_FIELDS`、`CgDisplayMarkers`、`setCgDisplayImageOptions`、`setCgDisplayBlockNode` 等 11 项。
 */

import * as Blockly from 'blockly';

import type {
  AssetDocument,
  CgDisplayNode,
} from '../../../../shared/projectTypes';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../../i18n/editorLocalization';
import { limitAssetFieldDisplay } from './assetNameField';

export const CG_DISPLAY_BLOCK_TYPE = 'vn_cg_display';

export const CG_DISPLAY_INPUTS = {
  body: 'BODY',
} as const;

export const CG_DISPLAY_FIELDS = {
  assetId: 'ASSET_ID',
  leadInSeconds: 'LEAD_IN_SECONDS',
} as const;

const LABEL_FIELDS = {
  display: 'VN_LABEL_CG_DISPLAY',
  leadIn: 'VN_LABEL_CG_LEAD_IN',
  seconds: 'VN_LABEL_CG_SECONDS',
  body: 'VN_LABEL_CG_BODY',
} as const;

const CONTROL_DATA_PREFIX = 'vn-cg-display:';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);
let currentImageOptions: Blockly.MenuOption[] = [
  [currentLabels.blockly.noImageAssets, ''],
];

export type CgDisplayMarkers = {
  endNodeId: string;
};

function imageOptions(
  assets: AssetDocument[],
  labels: EditorLabels,
): Blockly.MenuOption[] {
  const images = assets.filter((asset) => asset.type === 'image');
  return images.length > 0
    ? images.map((asset) => [asset.displayName, asset.id])
    : [[labels.blockly.noImageAssets, '']];
}

export function setCgDisplayImageOptions(
  assets: AssetDocument[],
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  currentImageOptions = imageOptions(assets, labels);
}

export function setCgDisplayBlockNode(
  block: Blockly.Block,
  node: Pick<CgDisplayNode, 'assetId' | 'leadInMs'>,
): void {
  const assetField = block.getField(CG_DISPLAY_FIELDS.assetId);
  if (assetField instanceof Blockly.FieldDropdown) {
    const options = currentImageOptions.some(
      (option) => option[1] === node.assetId,
    )
      ? currentImageOptions
      : [
          ...currentImageOptions.filter((option) => option[1] !== ''),
          [currentLabels.common.missingImage, node.assetId] as Blockly.MenuOption,
        ];
    assetField.setOptions(() => options);
    assetField.setValue(node.assetId);
  }
  block.setFieldValue(
    String(node.leadInMs / 1000),
    CG_DISPLAY_FIELDS.leadInSeconds,
  );
}

export function readCgDisplayBlock(
  block: Blockly.Block,
): Pick<CgDisplayNode, 'assetId' | 'leadInMs'> | null {
  const assetId = String(
    block.getFieldValue(CG_DISPLAY_FIELDS.assetId) ?? '',
  );
  const seconds = Number(
    block.getFieldValue(CG_DISPLAY_FIELDS.leadInSeconds),
  );
  const leadInMs = Math.round(seconds * 1000);
  return assetId.length > 0 &&
    Number.isFinite(seconds) &&
    Number.isSafeInteger(leadInMs) &&
    leadInMs >= 0 &&
    leadInMs <= 60_000
    ? { assetId, leadInMs }
    : null;
}

export function setCgDisplayMarkers(
  block: Blockly.Block,
  markers: CgDisplayMarkers,
): void {
  block.data = `${CONTROL_DATA_PREFIX}${JSON.stringify(markers)}`;
}

export function getCgDisplayMarkers(
  block: Blockly.Block,
): CgDisplayMarkers | null {
  if (!block.data?.startsWith(CONTROL_DATA_PREFIX)) {
    return null;
  }
  try {
    const value = JSON.parse(
      block.data.slice(CONTROL_DATA_PREFIX.length),
    ) as CgDisplayMarkers;
    return typeof value.endNodeId === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

export function applyCgDisplayBlockLocalization(
  block: Blockly.Block,
  labels: EditorLabels,
): void {
  currentLabels = labels;
  block.setFieldValue(labels.blockly.displayCg, LABEL_FIELDS.display);
  block.setFieldValue(labels.blockly.cgLeadIn, LABEL_FIELDS.leadIn);
  block.setFieldValue(labels.blockly.seconds, LABEL_FIELDS.seconds);
  block.setFieldValue(labels.blockly.cgDialogueBody, LABEL_FIELDS.body);
  const assetField = block.getField(CG_DISPLAY_FIELDS.assetId);
  if (assetField instanceof Blockly.FieldDropdown) {
    const value = String(assetField.getValue());
    const options = currentImageOptions.some((option) => option[1] === value)
      ? currentImageOptions
      : [
          ...currentImageOptions.filter((option) => option[1] !== ''),
          [labels.common.missingImage, value] as Blockly.MenuOption,
        ];
    assetField.setOptions(() => options);
    if (options.some((option) => option[1] === value)) {
      assetField.setValue(value);
    }
  }
  block.setTooltip(labels.blockly.cgDisplayTooltip);
}

export function registerCgDisplayBlock(
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  if (Blockly.Blocks[CG_DISPLAY_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[CG_DISPLAY_BLOCK_TYPE] = {
    init(): void {
      const assetField = new Blockly.FieldDropdown(() => currentImageOptions);
      limitAssetFieldDisplay(assetField);
      this.appendDummyInput()
        .appendField(currentLabels.blockly.displayCg, LABEL_FIELDS.display)
        .appendField(
          assetField,
          CG_DISPLAY_FIELDS.assetId,
        );
      this.appendDummyInput()
        .appendField(currentLabels.blockly.cgLeadIn, LABEL_FIELDS.leadIn)
        .appendField(
          new Blockly.FieldNumber(0, 0, 60, 0.001),
          CG_DISPLAY_FIELDS.leadInSeconds,
        )
        .appendField(currentLabels.blockly.seconds, LABEL_FIELDS.seconds);
      this.appendStatementInput(CG_DISPLAY_INPUTS.body)
        .appendField(currentLabels.blockly.cgDialogueBody, LABEL_FIELDS.body);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(285);
      this.setTooltip(currentLabels.blockly.cgDisplayTooltip);
      this.setHelpUrl('');
    },
  };
}
