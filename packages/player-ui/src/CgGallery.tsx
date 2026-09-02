/**
 * 主要作用：提供九宫格分页 CG 画廊、资源解析和灯箱预览。
 * 关键函数与实现：`CgGalleryProps`、`CgGallery`；基于 React 组件、Hooks、可访问交互与受控状态实现。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CgGalleryStyleDocument } from '@vnengine/runtime';

import type { PlayerUiLocalizationProps } from './localization';
import type { MediaUrlResolver } from './mediaPort';
import { createCgGalleryThemePresentation } from './pageTheme';
import { usePlayerUiLabels } from './PlayerUiProvider';

const IMAGES_PER_PAGE = 9;

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), '
      + 'select:not(:disabled), textarea:not(:disabled), '
      + '[tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.closest('[inert]'));
}

export type CgGalleryProps = PlayerUiLocalizationProps & {
  pages: ReadonlyArray<{
    imageAssetIds: readonly (string | null)[];
  }>;
  galleryStyle?: CgGalleryStyleDocument | null;
  resolveMediaUrl: MediaUrlResolver;
  restoreFocusTo?: HTMLElement | null;
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
  language,
  labels: labelsOverride,
  pages,
  galleryStyle,
  resolveMediaUrl,
  restoreFocusTo = null,
  onClose,
}: CgGalleryProps) {
  const allLabels = usePlayerUiLabels(language, labelsOverride);
  const labels = allLabels.cgGallery;
  const theme = createCgGalleryThemePresentation(galleryStyle);
  const [page, setPage] = useState(0);
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const enlargedTriggerRef = useRef<HTMLButtonElement>(null);
  const previousEnlargedIndexRef = useRef<number | null>(null);
  const restoreFocusToRef = useRef(restoreFocusTo);
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

  useLayoutEffect(() => {
    const previousFocus = restoreFocusToRef.current ?? (
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    );
    const layer = layerRef.current;
    (layer === null ? null : focusableElements(layer)[0] ?? layer)?.focus();
    return () => {
      queueMicrotask(() => {
        if (
          previousFocus?.isConnected
          && !previousFocus.matches(':disabled')
          && previousFocus.closest('[inert]') === null
        ) {
          previousFocus.focus();
        }
      });
    };
  }, []);

  useLayoutEffect(() => {
    const previousEnlargedIndex = previousEnlargedIndexRef.current;
    previousEnlargedIndexRef.current = enlargedIndex;
    if (enlargedIndex === null) {
      if (previousEnlargedIndex !== null) {
        queueMicrotask(() => {
          if (enlargedTriggerRef.current?.isConnected) {
            enlargedTriggerRef.current.focus();
          }
        });
      }
      return;
    }
    const lightbox = lightboxRef.current;
    const closeButton = lightbox?.querySelector<HTMLElement>(
      '.player-cg-lightbox-close',
    );
    (closeButton ?? lightbox)?.focus();
  }, [enlargedIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const activeLayer = enlargedIndex === null
          ? layerRef.current
          : lightboxRef.current;
        if (activeLayer === null) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const focusable = focusableElements(activeLayer);
        if (focusable.length === 0) {
          activeLayer.focus();
          return;
        }
        const currentIndex = document.activeElement instanceof HTMLElement
          ? focusable.indexOf(document.activeElement)
          : -1;
        const nextIndex = event.shiftKey
          ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
          : currentIndex < 0 || currentIndex === focusable.length - 1
            ? 0
            : currentIndex + 1;
        focusable[nextIndex]?.focus();
        return;
      }
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
      ref={layerRef}
      className="player-cg-gallery-layer"
      style={theme.style}
      data-player-cg-layout={theme.layout}
      data-player-cg-thumbnail-fit={theme.thumbnailFit}
      role="dialog"
      aria-modal={enlargedIndex === null ? 'true' : undefined}
      aria-label={labels.title}
      tabIndex={-1}
    >
      <section
        className="player-cg-gallery-card"
        aria-hidden={enlargedIndex !== null || undefined}
        inert={enlargedIndex !== null}
      >
        <header className="player-cg-gallery-header">
          <div>
            <p className="player-eyebrow">{labels.eyebrow}</p>
            <h2>{labels.title}</h2>
          </div>
          <button
            type="button"
            className="player-cg-close-button secondary"
            aria-label={labels.closeAria}
            title={allLabels.common.closeWithEscape}
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
                  ? labels.emptyThumbnailAria(imageNumber)
                  : labels.enlargeThumbnailAria(imageNumber)}
                disabled={assetId === null || typeof imageUrl !== 'string'}
                onClick={(event) => {
                  enlargedTriggerRef.current = event.currentTarget;
                  setEnlargedIndex(index);
                }}
              >
                {assetId === null ? (
                  <span>{labels.empty}</span>
                ) : typeof imageUrl === 'string' ? (
                  <img src={imageUrl} alt={labels.imageAlt(imageNumber)} />
                ) : (
                  <span>
                    {imageUrl === null
                      ? labels.imageLoadFailed
                      : labels.loadingImage}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <footer
          className="player-cg-pagination"
          aria-label={labels.paginationAria}
        >
          <button
            type="button"
            className="secondary"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            {labels.previousPage}
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
            {labels.nextPage}
          </button>
        </footer>
      </section>

      {enlargedIndex !== null && enlargedUrl !== null ? (
        <div
          ref={lightboxRef}
          className="player-cg-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={labels.enlargedAria(
            (page * IMAGES_PER_PAGE) + enlargedIndex + 1,
          )}
          tabIndex={-1}
        >
          <button
            type="button"
            className="player-cg-lightbox-backdrop"
            aria-label={labels.closeEnlargedAria}
            onClick={() => setEnlargedIndex(null)}
          />
          <figure>
            <img
              src={enlargedUrl}
              alt={labels.enlargedAria(
                (page * IMAGES_PER_PAGE) + enlargedIndex + 1,
              )}
            />
            <figcaption>
              {labels.enlargedCaption(
                (page * IMAGES_PER_PAGE) + enlargedIndex + 1,
              )}
            </figcaption>
          </figure>
          <button
            type="button"
            className="player-cg-lightbox-close secondary"
            aria-label={labels.closeEnlargedAria}
            title={allLabels.common.closeWithEscape}
            onClick={() => setEnlargedIndex(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
