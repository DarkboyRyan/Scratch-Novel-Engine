export const CG_GALLERY_PAGE_SIZE = 9;

export type CgGalleryPage = {
  pageNumber: number;
  slots: Array<string | null>;
};

export function cgGalleryPageCount(imageAssetIds: readonly string[]): number {
  return Math.max(1, Math.ceil(imageAssetIds.length / CG_GALLERY_PAGE_SIZE));
}

// When the last persisted page is full, Blockly renders one extra empty page
// so the author can continue adding CGs without a separate layout command.
export function editableCgGalleryPageCount(
  imageAssetIds: readonly string[],
): number {
  return Math.max(
    1,
    Math.ceil((imageAssetIds.length + 1) / CG_GALLERY_PAGE_SIZE),
  );
}

export function projectCgGalleryPages(
  imageAssetIds: readonly string[],
  editable = false,
): CgGalleryPage[] {
  const pageCount = editable
    ? editableCgGalleryPageCount(imageAssetIds)
    : cgGalleryPageCount(imageAssetIds);
  return Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageNumber: pageIndex + 1,
    slots: Array.from({ length: CG_GALLERY_PAGE_SIZE }, (_, slotIndex) =>
      imageAssetIds[pageIndex * CG_GALLERY_PAGE_SIZE + slotIndex] ?? null,
    ),
  }));
}

export function updateCgGallerySlot(
  imageAssetIds: readonly string[],
  absoluteIndex: number,
  imageAssetId: string | null,
): string[] {
  if (!Number.isSafeInteger(absoluteIndex) || absoluteIndex < 0) {
    return [...imageAssetIds];
  }

  const next = [...imageAssetIds];
  if (imageAssetId === null) {
    if (absoluteIndex < next.length) {
      next.splice(absoluteIndex, 1);
    }
    return next;
  }

  const duplicateIndex = next.indexOf(imageAssetId);
  if (duplicateIndex === absoluteIndex) {
    return next;
  }
  if (duplicateIndex >= 0) {
    next.splice(duplicateIndex, 1);
    if (duplicateIndex < absoluteIndex) {
      absoluteIndex -= 1;
    }
  }

  if (absoluteIndex >= next.length) {
    next.push(imageAssetId);
  } else {
    next[absoluteIndex] = imageAssetId;
  }
  return next;
}

export function moveCgGalleryImage(
  imageAssetIds: readonly string[],
  index: number,
  direction: -1 | 1,
): string[] {
  const target = index + direction;
  if (index < 0 || index >= imageAssetIds.length || target < 0 || target >= imageAssetIds.length) {
    return [...imageAssetIds];
  }
  const next = [...imageAssetIds];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
