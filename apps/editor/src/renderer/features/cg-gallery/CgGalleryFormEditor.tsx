/**
 * 文件主要作用：提供每页九图的 CG 画廊表单编辑与翻页操作。
 * 包含实现：`CgGalleryFormEditor`。
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';
import {
  CG_GALLERY_SCENE_ID,
  createEditorSceneOptions,
} from '../start-screen/startScreenScene';
import type { CgGalleryEditorHandle } from './CgGalleryBlocklyWorkspace';
import {
  CG_GALLERY_PAGE_SIZE,
  appendCgGalleryPage,
  createEmptyCgGalleryPage,
  deleteCgGalleryPage,
  sameCgGalleryPages,
  updateCgGallerySlot,
} from './cgGalleryProjection';
import { useEditorLabels } from '../../i18n/editorLocalization';

type CgGalleryPages = ProjectDocument['cgGallery']['pages'];

type CgGalleryFormEditorProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  previewUrls: Readonly<Record<string, string>>;
  isBusy: boolean;
  isStartPreviewDisabled: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onUpdateCgGallery: (pages: CgGalleryPages) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

export const CgGalleryFormEditor = forwardRef<
  CgGalleryEditorHandle,
  CgGalleryFormEditorProps
>(function CgGalleryFormEditor(
  {
    project,
    assets,
    previewUrls,
    isBusy,
    isStartPreviewDisabled,
    onSceneChange,
    onUpdateCgGallery,
    onDraftDirtyChange,
    onStartPreview,
  },
  ref,
) {
  const labels = useEditorLabels();
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const activeMutationRef = useRef<Promise<boolean> | null>(null);
  const galleryRef = useRef(project.cgGallery);
  galleryRef.current = project.cgGallery;

  const controlsDisabled = isBusy || isMutating;
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const imageById = new Map(imageAssets.map((asset) => [asset.id, asset]));
  const pages = project.cgGallery.pages;
  const pageCount = Math.max(1, pages.length);
  const currentPage = pages[pageIndex] ?? createEmptyCgGalleryPage();
  const sceneOptions = createEditorSceneOptions(project, labels);
  const selectedAssetIds = new Set(
    pages.flatMap((page) =>
      page.imageAssetIds.filter(
        (assetId): assetId is string => assetId !== null,
      ),
    ),
  );

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (expandedAssetId === null) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedAssetId(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expandedAssetId]);

  useEffect(
    () => () => onDraftDirtyChange(false),
    [onDraftDirtyChange],
  );

  const update = (nextPages: CgGalleryPages): Promise<boolean> => {
    if (activeMutationRef.current !== null) {
      return activeMutationRef.current;
    }
    if (sameCgGalleryPages(nextPages, galleryRef.current.pages)) {
      return Promise.resolve(true);
    }
    setIsMutating(true);
    onDraftDirtyChange(true);
    const mutation = onUpdateCgGallery(nextPages)
      .catch((error: unknown) => {
        console.error('同步 CG 画廊表单失败', error);
        return false;
      })
      .finally(() => {
        if (activeMutationRef.current === mutation) {
          activeMutationRef.current = null;
          setIsMutating(false);
          onDraftDirtyChange(false);
        }
      });
    activeMutationRef.current = mutation;
    return mutation;
  };

  useImperativeHandle(ref, () => ({
    flushPendingDraft: () =>
      activeMutationRef.current ?? Promise.resolve(true),
    focusPage: (nextPageIndex) => {
      setPageIndex(
        Math.max(0, Math.min(nextPageIndex, pageCount - 1)),
      );
    },
  }));

  const addPage = (): void => {
    const nextPages = appendCgGalleryPage(galleryRef.current.pages);
    const nextPageIndex = nextPages.length - 1;
    void update(nextPages).then((updated) => {
      if (updated) {
        setPageIndex(nextPageIndex);
      }
    });
  };

  const deletePage = (): void => {
    const nextPages = deleteCgGalleryPage(
      galleryRef.current.pages,
      pageIndex,
    );
    void update(nextPages).then((updated) => {
      if (updated) {
        setPageIndex((current) =>
          Math.min(current, nextPages.length - 1),
        );
      }
    });
  };

  return (
    <>
      <aside className="panel scene-panel cg-gallery-form-scene-panel">
        <div className="panel-heading">
          <h2>{labels.common.cgGallery}</h2>
        </div>
        <label className="start-screen-form-field">
          <span>{labels.scenes.currentScene}</span>
          <select
            aria-label={labels.scenes.currentScene}
            value={CG_GALLERY_SCENE_ID}
            disabled={controlsDisabled}
            onChange={(event) => {
              if (event.target.value !== CG_GALLERY_SCENE_ID) {
                void onSceneChange(event.target.value);
              }
            }}
          >
            {sceneOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="start-screen-form-field">
          <span>{labels.cgGallery.currentPage}</span>
          <select
            aria-label={labels.cgGallery.currentPage}
            value={pageIndex}
            disabled={controlsDisabled}
            onChange={(event) => setPageIndex(Number(event.target.value))}
          >
            {pages.map((_, index) => (
              <option key={index} value={index}>
                {labels.cgGallery.page} {index + 1}
              </option>
            ))}
          </select>
        </label>
        <div className="cg-gallery-page-actions">
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={addPage}
          >
            {labels.cgGallery.addPage}
          </button>
          <button
            type="button"
            disabled={controlsDisabled || pages.length <= 1}
            onClick={deletePage}
          >
            {labels.cgGallery.deletePage}
          </button>
        </div>
        <div className="start-screen-form-note">
          <strong>{labels.cgGallery.fixedPage}</strong>
          <p>{labels.cgGallery.fixedPageHelp}</p>
        </div>
      </aside>

      <section
        className="preview-panel cg-gallery-form-preview"
        aria-label={labels.cgGallery.preview}
      >
        <div className="preview-toolbar">
          <span>{labels.cgGallery.page} {pageIndex + 1} / {pageCount}</span>
          <button
            type="button"
            className="preview-play-button"
            aria-label={labels.cgGallery.previewFull}
            title={labels.cgGallery.previewFull}
            disabled={isStartPreviewDisabled}
            onClick={onStartPreview}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
        <div className="cg-gallery-design-preview">
          <div className="cg-gallery-grid">
            {Array.from(
              { length: CG_GALLERY_PAGE_SIZE },
              (_, slotIndex) => {
                const assetId = currentPage.imageAssetIds[slotIndex] ?? null;
                if (assetId === null) {
                  return (
                    <div
                      key={slotIndex}
                      className="cg-gallery-slot-empty"
                    >
                      {labels.cgGallery.imageSlot} {slotIndex + 1} · {labels.common.none}
                    </div>
                  );
                }
                const asset = imageById.get(assetId);
                const url = previewUrls[assetId] ?? null;
                return (
                  <button
                    key={`${slotIndex}:${assetId}`}
                    type="button"
                    className="cg-gallery-thumbnail"
                    disabled={url === null}
                    onClick={() => setExpandedAssetId(assetId)}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={asset?.displayName ?? labels.cgGallery.cgImageAlt}
                      />
                    ) : null}
                    <span>
                      {asset?.displayName ?? `${labels.common.missingImage} (${assetId})`}
                    </span>
                  </button>
                );
              },
            )}
          </div>
          <div className="cg-gallery-pagination">
            <button
              type="button"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((value) => value - 1)}
            >
              {labels.cgGallery.previousPage}
            </button>
            <button
              type="button"
              disabled={pageIndex + 1 >= pageCount}
              onClick={() => setPageIndex((value) => value + 1)}
            >
              {labels.cgGallery.nextPage}
            </button>
          </div>
        </div>
      </section>

      <aside className="panel inspector-panel cg-gallery-form-inspector">
        <div className="panel-heading">
          <h2>{labels.cgGallery.page} {pageIndex + 1} {labels.cgGallery.pageImagesSuffix}</h2>
        </div>
        <div className="cg-gallery-slot-fields">
          {Array.from(
            { length: CG_GALLERY_PAGE_SIZE },
            (_, slotIndex) => {
              const currentAssetId =
                currentPage.imageAssetIds[slotIndex] ?? null;
              return (
                <label key={slotIndex}>
                  <span>{labels.cgGallery.imageSlot} {slotIndex + 1}</span>
                  <select
                    aria-label={`${labels.cgGallery.imageSlot} ${slotIndex + 1}`}
                    value={currentAssetId ?? ''}
                    disabled={controlsDisabled}
                    onChange={(event) => {
                      const assetId = event.target.value || null;
                      void update(
                        updateCgGallerySlot(
                          galleryRef.current.pages,
                          pageIndex,
                          slotIndex,
                          assetId,
                        ),
                      );
                    }}
                  >
                    <option value="">{labels.common.none}</option>
                    {imageAssets
                      .filter(
                        (asset) =>
                          asset.id === currentAssetId ||
                          !selectedAssetIds.has(asset.id),
                      )
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.displayName}
                        </option>
                      ))}
                  </select>
                </label>
              );
            },
          )}
        </div>
      </aside>

      {expandedAssetId !== null ? (
        <div
          className="cg-gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={labels.cgGallery.viewLarge}
          onClick={() => setExpandedAssetId(null)}
        >
          <button
            type="button"
            className="cg-gallery-lightbox-close"
            aria-label={labels.cgGallery.closeLarge}
            onClick={() => setExpandedAssetId(null)}
          >
            ×
          </button>
          {previewUrls[expandedAssetId] ? (
            <img
              src={previewUrls[expandedAssetId]}
              alt={imageById.get(expandedAssetId)?.displayName ?? labels.cgGallery.cgImageAlt}
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
});
