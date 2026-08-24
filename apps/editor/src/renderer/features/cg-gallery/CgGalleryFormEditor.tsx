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
  const sceneOptions = createEditorSceneOptions(project);
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
          <h2>CG 画廊</h2>
        </div>
        <label className="start-screen-form-field">
          <span>当前场景</span>
          <select
            aria-label="当前场景"
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
          <span>当前 CG 页</span>
          <select
            aria-label="当前 CG 页"
            value={pageIndex}
            disabled={controlsDisabled}
            onChange={(event) => setPageIndex(Number(event.target.value))}
          >
            {pages.map((_, index) => (
              <option key={index} value={index}>
                第 {index + 1} 页
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
            新增一页
          </button>
          <button
            type="button"
            disabled={controlsDisabled || pages.length <= 1}
            onClick={deletePage}
          >
            删除本页
          </button>
        </div>
        <div className="start-screen-form-note">
          <strong>固定页面</strong>
          <p>每页固定 9 个槽位；空槽位会保存为“无”。</p>
        </div>
      </aside>

      <section
        className="preview-panel cg-gallery-form-preview"
        aria-label="CG 画廊预览"
      >
        <div className="preview-toolbar">
          <span>第 {pageIndex + 1} / {pageCount} 页</span>
          <button
            type="button"
            className="preview-play-button"
            aria-label="预览完整主界面与 CG 画廊"
            title="预览完整主界面与 CG 画廊"
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
                      图片 {slotIndex + 1} · 无
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
                        alt={asset?.displayName ?? 'CG 图片'}
                      />
                    ) : null}
                    <span>
                      {asset?.displayName ?? `缺失图片（${assetId}）`}
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
              上一页
            </button>
            <button
              type="button"
              disabled={pageIndex + 1 >= pageCount}
              onClick={() => setPageIndex((value) => value + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      <aside className="panel inspector-panel cg-gallery-form-inspector">
        <div className="panel-heading">
          <h2>第 {pageIndex + 1} 页图片</h2>
        </div>
        <div className="cg-gallery-slot-fields">
          {Array.from(
            { length: CG_GALLERY_PAGE_SIZE },
            (_, slotIndex) => {
              const currentAssetId =
                currentPage.imageAssetIds[slotIndex] ?? null;
              return (
                <label key={slotIndex}>
                  <span>图片 {slotIndex + 1}</span>
                  <select
                    aria-label={`图片 ${slotIndex + 1}`}
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
                    <option value="">无</option>
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
          aria-label="查看 CG 大图"
          onClick={() => setExpandedAssetId(null)}
        >
          <button
            type="button"
            className="cg-gallery-lightbox-close"
            aria-label="关闭大图"
            onClick={() => setExpandedAssetId(null)}
          >
            ×
          </button>
          {previewUrls[expandedAssetId] ? (
            <img
              src={previewUrls[expandedAssetId]}
              alt={imageById.get(expandedAssetId)?.displayName ?? 'CG 图片'}
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
});
