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
import {
  CgGalleryBlocklyWorkspace,
  type CgGalleryEditorHandle,
} from './CgGalleryBlocklyWorkspace';
import { deleteCgGalleryPage } from './cgGalleryProjection';

type CgGalleryEditorProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  isBusy: boolean;
  isStartPreviewDisabled: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onUpdateCgGallery: (
    pages: ProjectDocument['cgGallery']['pages'],
  ) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

export const CgGalleryEditor = forwardRef<
  CgGalleryEditorHandle,
  CgGalleryEditorProps
>(function CgGalleryEditor(
  {
    project,
    assets,
    isBusy,
    isStartPreviewDisabled,
    onSceneChange,
    onUpdateCgGallery,
    onDraftDirtyChange,
    onStartPreview,
  },
  ref,
) {
  const workspaceRef = useRef<CgGalleryEditorHandle>(null);
  const [isChangingScene, setIsChangingScene] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const sceneOptions = createEditorSceneOptions(project);
  const pageCount = Math.max(1, project.cgGallery.pages.length);
  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);
  useImperativeHandle(ref, () => ({
    flushPendingDraft: () =>
      workspaceRef.current?.flushPendingDraft() ?? Promise.resolve(true),
    focusPage: (nextPageIndex) =>
      workspaceRef.current?.focusPage(nextPageIndex),
  }));

  return (
    <main className="block-editor cg-gallery-editor" aria-labelledby="cg-gallery-editor-title">
      <header className="block-editor-heading">
        <div>
          <h1 id="cg-gallery-editor-title">CG 画廊编辑器</h1>
          <p>每个大模块代表一页；从工具箱拖入新模块才会新增页面</p>
        </div>
        <div className="block-editor-heading-controls">
          <label className="block-editor-scene-picker">
            <span>当前场景</span>
            <select
              className="scene-select block-editor-scene-select"
              value={CG_GALLERY_SCENE_ID}
              disabled={isBusy || isChangingScene}
              onChange={(event) => {
                const nextSceneId = event.target.value;
                if (nextSceneId === CG_GALLERY_SCENE_ID) {
                  return;
                }
                void (async () => {
                  setIsChangingScene(true);
                  try {
                    const flushed =
                      await (workspaceRef.current?.flushPendingDraft() ?? true);
                    if (flushed) {
                      await onSceneChange(nextSceneId);
                    }
                  } finally {
                    setIsChangingScene(false);
                  }
                })();
              }}
            >
              {sceneOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block-editor-scene-picker">
            <span>当前 CG 页</span>
            <select
              aria-label="当前 CG 页"
              className="scene-select block-editor-scene-select"
              value={pageIndex}
              disabled={isBusy}
              onChange={(event) => {
                const nextPageIndex = Number(event.target.value);
                setPageIndex(nextPageIndex);
                workspaceRef.current?.focusPage(nextPageIndex);
              }}
            >
              {project.cgGallery.pages.map((_, index) => (
                <option key={index} value={index}>
                  第 {index + 1} 页
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="scene-inline-action"
            disabled={isBusy || project.cgGallery.pages.length <= 1}
            onClick={() => {
              void (async () => {
                const flushed =
                  await (workspaceRef.current?.flushPendingDraft() ?? true);
                if (!flushed) {
                  return;
                }
                const nextPages = deleteCgGalleryPage(
                  project.cgGallery.pages,
                  pageIndex,
                );
                if (await onUpdateCgGallery(nextPages)) {
                  setPageIndex((current) =>
                    Math.min(current, nextPages.length - 1),
                  );
                }
              })();
            }}
          >
            删除本页
          </button>
          <span className="block-editor-sync-badge">
            每页固定 9 个图片槽位
          </span>
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
      </header>
      <section
        className="block-editor-workspace cg-gallery-editor-workspace"
        aria-label="CG 画廊积木工作区"
      >
        <CgGalleryBlocklyWorkspace
          ref={workspaceRef}
          gallery={project.cgGallery}
          assets={assets}
          isBusy={isBusy}
          onUpdateCgGallery={onUpdateCgGallery}
          onDraftDirtyChange={onDraftDirtyChange}
        />
      </section>
    </main>
  );
});
