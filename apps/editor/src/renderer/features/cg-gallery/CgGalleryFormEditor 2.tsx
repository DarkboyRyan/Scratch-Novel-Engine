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
  cgGalleryPageCount,
  moveCgGalleryImage,
} from './cgGalleryProjection';

type CgGalleryFormEditorProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  previewUrls: Readonly<Record<string, string>>;
  isBusy: boolean;
  isStartPreviewDisabled: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onUpdateCgGallery: (imageAssetIds: string[]) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

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
  const [newImageAssetId, setNewImageAssetId] = useState('');
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const activeMutationRef = useRef<Promise<boolean> | null>(null);
  const galleryRef = useRef(project.cgGallery);
  galleryRef.current = project.cgGallery;
  const controlsDisabled = isBusy || isMutating;
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const imageById = new Map(imageAssets.map((asset) => [asset.id, asset]));
  const selectedIds = project.cgGallery.imageAssetIds;
  const availableImages = imageAssets.filter((asset) => !selectedIds.includes(asset.id));
  const pageCount = cgGalleryPageCount(selectedIds);
  const pageIds = selectedIds.slice(
    pageIndex * CG_GALLERY_PAGE_SIZE,
    (pageIndex + 1) * CG_GALLERY_PAGE_SIZE,
  );
  const sceneOptions = createEditorSceneOptions(project);

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

  const update = (imageAssetIds: string[]): Promise<boolean> => {
    if (activeMutationRef.current !== null) {
      return activeMutationRef.current;
    }
    if (sameIds(imageAssetIds, galleryRef.current.imageAssetIds)) {
      return Promise.resolve(true);
    }
    setIsMutating(true);
    onDraftDirtyChange(true);
    const mutation = onUpdateCgGallery(imageAssetIds)
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
    flushPendingDraft: () => activeMutationRef.current ?? Promise.resolve(true),
  }));

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
        <div className="start-screen-form-note">
          <strong>主界面扩展页面</strong>
          <p>Player 每页显示 9 张缩略图，点击后可查看完整图片。</p>
        </div>
      </aside>

      <section className="preview-panel cg-gallery-form-preview" aria-label="CG 画廊预览">
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
          {pageIds.length === 0 ? (
            <p className="cg-gallery-empty">还没有选择 CG 图片</p>
          ) : (
            <div className="cg-gallery-grid">
              {pageIds.map((assetId) => {
                const asset = imageById.get(assetId);
                const url = previewUrls[assetId] ?? null;
                return (
                  <button
                    key={assetId}
                    type="button"
                    className="cg-gallery-thumbnail"
                    disabled={url === null}
                    onClick={() => setExpandedAssetId(assetId)}
                  >
                    {url ? <img src={url} alt={asset?.displayName ?? 'CG 图片'} /> : null}
                    <span>{asset?.displayName ?? `缺失图片（${assetId}）`}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="cg-gallery-pagination">
            <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((value) => value - 1)}>
              上一页
            </button>
            <button type="button" disabled={pageIndex + 1 >= pageCount} onClick={() => setPageIndex((value) => value + 1)}>
              下一页
            </button>
          </div>
        </div>
      </section>

      <aside className="panel inspector-panel cg-gallery-form-inspector">
        <div className="panel-heading">
          <h2>画廊图片</h2>
        </div>
        <label>
          添加图片
          <select
            aria-label="添加 CG 图片"
            value={newImageAssetId}
            disabled={controlsDisabled || availableImages.length === 0}
            onChange={(event) => setNewImageAssetId(event.target.value)}
          >
            <option value="">选择图片…</option>
            {availableImages.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.displayName}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="cg-gallery-add-button"
          disabled={controlsDisabled || newImageAssetId.length === 0}
          onClick={() => {
            const assetId = newImageAssetId;
            setNewImageAssetId('');
            void update([...galleryRef.current.imageAssetIds, assetId]);
          }}
        >
          添加到画廊
        </button>
        <ol className="cg-gallery-selected-list">
          {selectedIds.map((assetId, index) => (
            <li key={assetId}>
              <span>{index + 1}. {imageById.get(assetId)?.displayName ?? `缺失图片（${assetId}）`}</span>
              <div>
                <button type="button" aria-label={`上移 ${index + 1}`} disabled={controlsDisabled || index === 0} onClick={() => void update(moveCgGalleryImage(galleryRef.current.imageAssetIds, index, -1))}>↑</button>
                <button type="button" aria-label={`下移 ${index + 1}`} disabled={controlsDisabled || index + 1 === selectedIds.length} onClick={() => void update(moveCgGalleryImage(galleryRef.current.imageAssetIds, index, 1))}>↓</button>
                <button type="button" aria-label={`移除 ${index + 1}`} disabled={controlsDisabled} onClick={() => void update(galleryRef.current.imageAssetIds.filter((id) => id !== assetId))}>移除</button>
              </div>
            </li>
          ))}
        </ol>
      </aside>

      {expandedAssetId !== null ? (
        <div className="cg-gallery-lightbox" role="dialog" aria-modal="true" aria-label="查看 CG 大图" onClick={() => setExpandedAssetId(null)}>
          <button type="button" className="cg-gallery-lightbox-close" aria-label="关闭大图" onClick={() => setExpandedAssetId(null)}>×</button>
          {previewUrls[expandedAssetId] ? (
            <img src={previewUrls[expandedAssetId]} alt={imageById.get(expandedAssetId)?.displayName ?? 'CG 图片'} onClick={(event) => event.stopPropagation()} />
          ) : null}
        </div>
      ) : null}
    </>
  );
});
