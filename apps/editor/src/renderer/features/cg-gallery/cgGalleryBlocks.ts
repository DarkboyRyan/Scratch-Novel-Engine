/**
 * 文件主要作用：注册 CG 画廊根积木、分页积木和九个图片槽位。
 * 包含实现：`CG_GALLERY_PAGE_BLOCK_TYPE`、`CG_GALLERY_PAGE_BLOCK_ID_PREFIX`、`CG_GALLERY_IMAGE_FIELD_PREFIX`、`CgGalleryAssetOption`、`cgGalleryPageBlockId`、`cgGalleryImageFieldName` 等 12 项。
 */

import * as Blockly from 'blockly';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';
import {
  CG_GALLERY_PAGE_SIZE,
  allCgGalleryImageAssetIds,
  projectCgGalleryPages,
} from './cgGalleryProjection';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../i18n/editorLocalization';
import { limitAssetFieldDisplay } from '../block-editor/blocks/assetNameField';

export const CG_GALLERY_PAGE_BLOCK_TYPE = 'vn_cg_gallery_page';
export const CG_GALLERY_PAGE_BLOCK_ID_PREFIX = 'vn-editor-cg-page-';
export const CG_GALLERY_IMAGE_FIELD_PREFIX = 'CG_IMAGE_';
const CG_GALLERY_LABEL_FIELDS = {
  title: 'VN_LABEL_CG_TITLE',
  pagePrefix: 'VN_LABEL_CG_PAGE_PREFIX',
  pageSuffix: 'VN_LABEL_CG_PAGE_SUFFIX',
  slotPrefix: 'VN_LABEL_CG_SLOT_',
} as const;
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

type CgGalleryDocument = ProjectDocument['cgGallery'];
export type CgGalleryAssetOption = [label: string, value: string];

export function cgGalleryPageBlockId(pageIndex: number): string {
  return `${CG_GALLERY_PAGE_BLOCK_ID_PREFIX}${pageIndex}`;
}

export function cgGalleryImageFieldName(slotIndex: number): string {
  return `${CG_GALLERY_IMAGE_FIELD_PREFIX}${slotIndex}`;
}

export function parseCgGalleryPageBlockId(blockId: string): number | null {
  if (!blockId.startsWith(CG_GALLERY_PAGE_BLOCK_ID_PREFIX)) {
    return null;
  }
  const value = Number(blockId.slice(CG_GALLERY_PAGE_BLOCK_ID_PREFIX.length));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseCgGalleryImageFieldName(
  fieldName: string | undefined,
): number | null {
  if (!fieldName?.startsWith(CG_GALLERY_IMAGE_FIELD_PREFIX)) {
    return null;
  }
  const value = Number(fieldName.slice(CG_GALLERY_IMAGE_FIELD_PREFIX.length));
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value < CG_GALLERY_PAGE_SIZE
    ? value
    : null;
}

function registerCgGalleryPageBlock(): void {
  if (Blockly.Blocks[CG_GALLERY_PAGE_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[CG_GALLERY_PAGE_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput('HEADER')
        .appendField(currentLabels.blockly.cgTitle, CG_GALLERY_LABEL_FIELDS.title)
        .appendField(currentLabels.blockly.pagePrefix, CG_GALLERY_LABEL_FIELDS.pagePrefix)
        .appendField(new Blockly.FieldLabelSerializable('1'), 'PAGE_NUMBER')
        .appendField(currentLabels.blockly.pageSuffix, CG_GALLERY_LABEL_FIELDS.pageSuffix);
      for (let slotIndex = 0; slotIndex < CG_GALLERY_PAGE_SIZE; slotIndex += 1) {
        const assetField = new Blockly.FieldDropdown([
          [currentLabels.common.none, ''],
        ]);
        limitAssetFieldDisplay(assetField);
        this.appendDummyInput(`SLOT_${slotIndex}`)
          .appendField(
            `${currentLabels.blockly.imageSlot} ${slotIndex + 1}`,
            `${CG_GALLERY_LABEL_FIELDS.slotPrefix}${slotIndex}`,
          )
          .appendField(
            assetField,
            cgGalleryImageFieldName(slotIndex),
          );
      }
      this.setInputsInline(false);
      this.setColour(285);
      this.setTooltip(currentLabels.blockly.cgTooltip);
      this.setHelpUrl('');
    },
  };
}

export function registerCgGalleryBlocks(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  registerCgGalleryPageBlock();
}

export function createCgGalleryToolbox(
  labels: EditorLabels = currentLabels,
): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: labels.blockly.categories.cgGallery,
        colour: '285',
        contents: [
          { kind: 'block', type: CG_GALLERY_PAGE_BLOCK_TYPE },
        ],
      },
    ],
  };
}

function assetOptions(
  gallery: CgGalleryDocument,
  assets: AssetDocument[],
  currentAssetId: string | null,
  labels: EditorLabels,
): CgGalleryAssetOption[] {
  const selectedElsewhere = new Set(
    allCgGalleryImageAssetIds(gallery.pages),
  );
  if (currentAssetId !== null) {
    selectedElsewhere.delete(currentAssetId);
  }
  const options: CgGalleryAssetOption[] = [
    [labels.common.none, ''],
    ...assets
      .filter(
        (asset) =>
          asset.type === 'image' && !selectedElsewhere.has(asset.id),
      )
      .map((asset): CgGalleryAssetOption => [asset.displayName, asset.id]),
  ];
  if (
    currentAssetId !== null &&
    !options.some(([, value]) => value === currentAssetId)
  ) {
    options.push([`${labels.common.missingImage} (${currentAssetId})`, currentAssetId]);
  }
  return options;
}

function initializeBlock(block: Blockly.Block): void {
  if (block instanceof Blockly.BlockSvg) {
    block.initSvg();
    block.render();
  }
}

export function renderCgGalleryBlocks(
  workspace: Blockly.Workspace,
  gallery: CgGalleryDocument,
  assets: AssetDocument[],
  editable = true,
  labels: EditorLabels = currentLabels,
): void {
  registerCgGalleryBlocks(labels);
  const pages = projectCgGalleryPages(gallery.pages);

  Blockly.Events.disable();
  try {
    workspace.clear();
    for (const [pageIndex, page] of pages.entries()) {
      const block = workspace.newBlock(
        CG_GALLERY_PAGE_BLOCK_TYPE,
        cgGalleryPageBlockId(pageIndex),
      );
      block.setFieldValue(String(page.pageNumber), 'PAGE_NUMBER');
      block.setMovable(false);
      block.setDeletable(editable && gallery.pages.length > 1);
      block.setEditable(editable);
      block.contextMenu = false;

      for (let slotIndex = 0; slotIndex < CG_GALLERY_PAGE_SIZE; slotIndex += 1) {
        const fieldName = cgGalleryImageFieldName(slotIndex);
        const field = block.getField(fieldName);
        if (!(field instanceof Blockly.FieldDropdown)) {
          throw new Error(`CG gallery field ${fieldName} is not a dropdown`);
        }
        const currentAssetId = page.slots[slotIndex] ?? null;
        field.setOptions(assetOptions(gallery, assets, currentAssetId, labels));
        block.setFieldValue(currentAssetId ?? '', fieldName);
        field.setEnabled(editable);
      }

      initializeBlock(block);
      if (block instanceof Blockly.BlockSvg) {
        block.moveBy(48 + pageIndex * 330, 48);
      }
    }
    if (workspace instanceof Blockly.WorkspaceSvg) {
      Blockly.renderManagement.triggerQueuedRenders(workspace);
    }
  } finally {
    Blockly.Events.enable();
  }
}

export function applyCgGalleryBlocksLocalization(
  workspace: Blockly.Workspace,
  gallery: CgGalleryDocument,
  assets: AssetDocument[],
  labels: EditorLabels,
): void {
  registerCgGalleryBlocks(labels);
  Blockly.Events.disable();
  try {
    for (const [pageIndex, page] of projectCgGalleryPages(gallery.pages).entries()) {
      const block = workspace.getBlockById(cgGalleryPageBlockId(pageIndex));
      if (!block) {
        continue;
      }
      block.setFieldValue(labels.blockly.cgTitle, CG_GALLERY_LABEL_FIELDS.title);
      block.setFieldValue(labels.blockly.pagePrefix, CG_GALLERY_LABEL_FIELDS.pagePrefix);
      block.setFieldValue(labels.blockly.pageSuffix, CG_GALLERY_LABEL_FIELDS.pageSuffix);
      block.setTooltip(labels.blockly.cgTooltip);
      for (let slotIndex = 0; slotIndex < CG_GALLERY_PAGE_SIZE; slotIndex += 1) {
        block.setFieldValue(
          `${labels.blockly.imageSlot} ${slotIndex + 1}`,
          `${CG_GALLERY_LABEL_FIELDS.slotPrefix}${slotIndex}`,
        );
        const fieldName = cgGalleryImageFieldName(slotIndex);
        const field = block.getField(fieldName);
        if (!(field instanceof Blockly.FieldDropdown)) {
          continue;
        }
        const currentAssetId = page.slots[slotIndex] ?? null;
        field.setOptions(assetOptions(gallery, assets, currentAssetId, labels));
        field.setValue(currentAssetId ?? '');
      }
      if (block instanceof Blockly.BlockSvg) {
        block.render();
      }
    }
    if (workspace instanceof Blockly.WorkspaceSvg) {
      Blockly.renderManagement.triggerQueuedRenders(workspace);
    }
  } finally {
    Blockly.Events.enable();
  }
}
