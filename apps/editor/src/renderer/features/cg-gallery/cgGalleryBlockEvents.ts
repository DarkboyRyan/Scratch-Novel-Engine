import * as Blockly from 'blockly';

import type { ProjectDocument } from '../../../shared/projectTypes';
import {
  appendCgGalleryPage,
  deleteCgGalleryPage,
  updateCgGallerySlot,
} from './cgGalleryProjection';
import {
  CG_GALLERY_PAGE_BLOCK_TYPE,
  parseCgGalleryImageFieldName,
  parseCgGalleryPageBlockId,
} from './cgGalleryBlocks';

type CgGalleryPages = ProjectDocument['cgGallery']['pages'];

export function getCgGalleryFieldUpdate(
  event: Blockly.Events.Abstract,
  pages: CgGalleryPages,
): CgGalleryPages | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }
  const change = event as Blockly.Events.BlockChange;
  if (change.element !== 'field') {
    return null;
  }
  const pageIndex = parseCgGalleryPageBlockId(change.blockId ?? '');
  const slotIndex = parseCgGalleryImageFieldName(change.name);
  if (pageIndex === null || slotIndex === null) {
    return null;
  }
  const nextAssetId =
    typeof change.newValue === 'string' && change.newValue.length > 0
      ? change.newValue
      : null;
  return updateCgGallerySlot(
    pages,
    pageIndex,
    slotIndex,
    nextAssetId,
  );
}

export function getNewCgGalleryPageDrop(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  pages: CgGalleryPages,
): CgGalleryPages | null {
  if (event.type !== Blockly.Events.BLOCK_MOVE) {
    return null;
  }
  const move = event as Blockly.Events.BlockMove;
  if (!move.blockId || !move.reason?.includes('drag')) {
    return null;
  }
  // Projected page IDs are deterministic. A page block with any other ID
  // came from the toolbox and represents an explicit request to append a page.
  if (parseCgGalleryPageBlockId(move.blockId) !== null) {
    return null;
  }
  const block = workspace.getBlockById(move.blockId);
  if (block?.type !== CG_GALLERY_PAGE_BLOCK_TYPE) {
    return null;
  }
  return appendCgGalleryPage(pages);
}

export function getDeletedCgGalleryPageUpdate(
  event: Blockly.Events.Abstract,
  pages: CgGalleryPages,
): CgGalleryPages | null {
  if (event.type !== Blockly.Events.BLOCK_DELETE) {
    return null;
  }
  const deleted = event as Blockly.Events.BlockDelete;
  const pageIndex = parseCgGalleryPageBlockId(deleted.blockId ?? '');
  if (pageIndex === null || pages.length <= 1) {
    return null;
  }
  return deleteCgGalleryPage(pages, pageIndex);
}
