import { useEffect, useMemo, useState } from 'react';

import type { MediaUrlResolver } from './mediaPort';

const IMAGES_PER_PAGE = 9;

export type CgGalleryProps = {
  pages: ReadonlyArray<{
    imageAssetIds: readonly (string | null)[];
  }>;
  resolveMediaUrl: MediaUrlResolver;
  onClose: () => void;
};

function useResolvedGalleryImages(
  assetIds: readonly string[],
  resolveMediaUrl: MediaUrlResolver,
): Readonly<Record<string, string | null>> {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const assetIdsKey = assetIds.join('\0');

  useEffect(() => {
    let active = true;
    setUrls({});
    void Promise.all(
      assetIds.map(async (assetId) => {
        try {
          return [assetId, await resolveMediaUrl(assetId)] as const;
        } catch {
          return [assetId, null] as const;
        }
      }),
    ).then((entries) => {
      if (active) {
        setUrls(Object.fromEntries(entries));
      }
    });
    return () => {
      active = false;
    };
  }, [assetIdsKey, resolveMediaUrl]);

  return urls;
}

export function CgGallery({
  pages,
  resolveMediaUrl,
  onClose,
}: CgGalleryProps) {
  const [page, setPage] = useState(0);
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);
  const pageCount = Math.max(1, pages.length);
  const pageAssetIds = pages[page]?.imageAssetIds ?? [];
  const resolvableAssetIds = useMemo(
    () => pageAssetIds.filter((assetId): assetId is string => assetId !== null),
    [pageAssetIds],
  );
  const urls = useResolvedGalleryImages(resolvableAssetIds, resolveMediaUrl);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (enlargedIndex !== null) {
        setEnlargedIndex(null);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, {
      capture: true,
    });
  }, [enlargedIndex, onClose]);

  const enlargedAssetId = enlargedIndex === null
    ? null
    : pageAssetIds[enlargedIndex] ?? null;
  const enlargedUrl = enlargedAssetId === null
    ? null
    : urls[enlargedAssetId] ?? null;

  return (
    <div
      className="player-cg-gallery-layer"
      role="dialog"
      aria-modal="true"
      aria-label="CG画廊"
    >
      <section className="player-cg-gallery-card">
        <header className="player-cg-gallery-header">
          <div>
            <p className="player-eyebrow">CG GALLERY</p>
            <h2>CG画廊</h2>
          </div>
          <button
            type="button"
            className="player-cg-close-button secondary"
            aria-label="关闭CG画廊"
            title="关闭（Esc）"
            autoFocus
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="player-cg-grid">
          {Array.from({ length: IMAGES_PER_PAGE }, (_, index) => {
            const assetId = pageAssetIds[index] ?? null;
            const imageNumber = (page * IMAGES_PER_PAGE) + index + 1;
            const imageUrl = assetId === null ? undefined : urls[assetId];
            return (
              <button
                key={`${page}:${index}`}
                type="button"
                className="player-cg-thumbnail"
                aria-label={assetId === null
                  ? `CG ${imageNumber}：无`
                  : `放大 CG ${imageNumber}`}
                disabled={assetId === null || typeof imageUrl !== 'string'}
                onClick={() => setEnlargedIndex(index)}
              >
                {assetId === null ? (
                  <span>无</span>
                ) : typeof imageUrl === 'string' ? (
                  <img src={imageUrl} alt={`CG ${imageNumber}`} />
                ) : (
                  <span>
                    {imageUrl === null ? '图片无法读取' : '正在载入…'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <footer className="player-cg-pagination" aria-label="CG画廊分页">
          <button
            type="button"
            className="secondary"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            上一页
          </button>
          <span aria-live="polite">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          >
            下一页
          </button>
        </footer>
      </section>

      {enlargedIndex !== null && enlargedUrl !== null ? (
        <div
          className="player-cg-lightbox"
          aria-label={
            `CG ${(page * IMAGES_PER_PAGE) + enlargedIndex + 1} 大图`
          }
        >
          <button
            type="button"
            className="player-cg-lightbox-backdrop"
            aria-label="关闭CG大图"
            onClick={() => setEnlargedIndex(null)}
          />
          <figure>
            <img
              src={enlargedUrl}
              alt={
                `CG ${(page * IMAGES_PER_PAGE) + enlargedIndex + 1} 大图`
              }
            />
            <figcaption>
              CG {(page * IMAGES_PER_PAGE) + enlargedIndex + 1}
            </figcaption>
          </figure>
          <button
            type="button"
            className="player-cg-lightbox-close secondary"
            aria-label="关闭CG大图"
            title="关闭（Esc）"
            onClick={() => setEnlargedIndex(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
