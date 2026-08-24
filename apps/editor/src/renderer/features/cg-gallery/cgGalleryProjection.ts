import type { ProjectDocument } from '../../../shared/projectTypes';

export const CG_GALLERY_PAGE_SIZE = 9;

type CgGalleryDocument = ProjectDocument['cgGallery'];
export type CgGalleryPages = CgGalleryDocument['pages'];
export type CgGalleryPageDocument = CgGalleryPages[number];

export type CgGalleryPage = {
  pageNumber: number;
  slots: Array<string | null>;
};

export function createEmptyCgGalleryPage(): CgGalleryPageDocument {
  return {
    imageAssetIds: Array.from(
      { length: CG_GALLERY_PAGE_SIZE },
      () => null,
    ),
  };
}

export function cgGalleryPageCount(pages: CgGalleryPages): number {
  return Math.max(1, pages.length);
}

export function projectCgGalleryPages(
  pages: CgGalleryPages,
): CgGalleryPage[] {
  const sourcePages =
    pages.length > 0 ? pages : [createEmptyCgGalleryPage()];
  return sourcePages.map((page, pageIndex) => ({
    pageNumber: pageIndex + 1,
    slots: Array.from(
      { length: CG_GALLERY_PAGE_SIZE },
      (_, slotIndex) => page.imageAssetIds[slotIndex] ?? null,
    ),
  }));
}

export function allCgGalleryImageAssetIds(
  pages: CgGalleryPages,
): string[] {
  return pages.flatMap((page) =>
    page.imageAssetIds.filter(
      (assetId): assetId is string => assetId !== null,
    ),
  );
}

export function sameCgGalleryPages(
  left: CgGalleryPages,
  right: CgGalleryPages,
): boolean {
  return (
    left.length === right.length &&
    left.every((page, pageIndex) =>
      page.imageAssetIds.every(
        (assetId, slotIndex) =>
          assetId === right[pageIndex]?.imageAssetIds[slotIndex],
      ),
    )
  );
}

export function updateCgGallerySlot(
  pages: CgGalleryPages,
  pageIndex: number,
  slotIndex: number,
  imageAssetId: string | null,
): CgGalleryPages {
  if (
    !Number.isSafeInteger(pageIndex) ||
    !Number.isSafeInteger(slotIndex) ||
    pageIndex < 0 ||
    pageIndex >= pages.length ||
    slotIndex < 0 ||
    slotIndex >= CG_GALLERY_PAGE_SIZE
  ) {
    return pages.map((page) => ({
      imageAssetIds: [...page.imageAssetIds],
    }));
  }

  // An Asset may appear in at most one slot. Selecting an image that is
  // already present moves it to the requested slot instead of duplicating it.
  const next = pages.map((page) => ({
    imageAssetIds: Array.from(
      { length: CG_GALLERY_PAGE_SIZE },
      (_, index) => {
        const current = page.imageAssetIds[index] ?? null;
        return imageAssetId !== null && current === imageAssetId
          ? null
          : current;
      },
    ),
  }));
  next[pageIndex].imageAssetIds[slotIndex] = imageAssetId;
  return next;
}

export function appendCgGalleryPage(
  pages: CgGalleryPages,
): CgGalleryPages {
  return [...pages, createEmptyCgGalleryPage()];
}

export function deleteCgGalleryPage(
  pages: CgGalleryPages,
  pageIndex: number,
): CgGalleryPages {
  if (
    pages.length <= 1 ||
    !Number.isSafeInteger(pageIndex) ||
    pageIndex < 0 ||
    pageIndex >= pages.length
  ) {
    return pages.map((page) => ({
      imageAssetIds: [...page.imageAssetIds],
    }));
  }
  return pages
    .filter((_, index) => index !== pageIndex)
    .map((page) => ({ imageAssetIds: [...page.imageAssetIds] }));
}
