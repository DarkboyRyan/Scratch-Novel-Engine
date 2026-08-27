import * as Blockly from 'blockly';

import {
  CG_GALLERY_PAGE_SIZE,
  updateCgGallerySlot,
} from './cgGalleryProjection';
import {
  parseCgGalleryImageFieldName,
  parseCgGalleryPageBlockId,
} from './cgGalleryBlocks';

export function getCgGalleryFieldUpdate(
  event: Blockly.Events.Abstract,
  imageAssetIds: readonly string[],
): string[] | null {
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
    imageAssetIds,
    pageIndex * CG_GALLERY_PAGE_SIZE + slotIndex,
    nextAssetId,
  );
}
