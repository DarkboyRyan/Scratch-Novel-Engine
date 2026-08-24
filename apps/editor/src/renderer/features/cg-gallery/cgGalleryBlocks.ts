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

export const CG_GALLERY_PAGE_BLOCK_TYPE = 'vn_cg_gallery_page';
export const CG_GALLERY_PAGE_BLOCK_ID_PREFIX = 'vn-editor-cg-page-';
export const CG_GALLERY_IMAGE_FIELD_PREFIX = 'CG_IMAGE_';

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
        .appendField('CG 画廊')
        .appendField('第')
        .appendField(new Blockly.FieldLabelSerializable('1'), 'PAGE_NUMBER')
        .appendField('页');
      for (let slotIndex = 0; slotIndex < CG_GALLERY_PAGE_SIZE; slotIndex += 1) {
        this.appendDummyInput(`SLOT_${slotIndex}`)
          .appendField(`图片 ${slotIndex + 1}`)
          .appendField(
            new Blockly.FieldDropdown([['无', '']]),
            cgGalleryImageFieldName(slotIndex),
          );
      }
      this.setInputsInline(false);
      this.setColour(285);
      this.setTooltip('每页最多九张 CG；白色下拉框用于选择图片');
      this.setHelpUrl('');
    },
  };
}

export function registerCgGalleryBlocks(): void {
  registerCgGalleryPageBlock();
}

export function createCgGalleryToolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'CG 画廊',
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
): CgGalleryAssetOption[] {
  const selectedElsewhere = new Set(
    allCgGalleryImageAssetIds(gallery.pages),
  );
  if (currentAssetId !== null) {
    selectedElsewhere.delete(currentAssetId);
  }
  const options: CgGalleryAssetOption[] = [
    ['无', ''],
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
    options.push([`缺失图片（${currentAssetId}）`, currentAssetId]);
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
): void {
  registerCgGalleryBlocks();
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
        field.setOptions(assetOptions(gallery, assets, currentAssetId));
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
