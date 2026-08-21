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
import type { StartScreenEditorHandle } from './StartScreenEditor';
import {
  createEditorSceneOptions,
  START_SCREEN_SCENE_ID,
} from './startScreenScene';

type StartScreenFormEditorProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  backgroundUrl: string | null;
  isBusy: boolean;
  isStartPreviewDisabled: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onUpdateStartScreen: (
    title: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

function normalizeTitleDraft(value: string): string {
  return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu, '');
}

export const StartScreenFormEditor = forwardRef<
  StartScreenEditorHandle,
  StartScreenFormEditorProps
>(function StartScreenFormEditor(
  {
    project,
    assets,
    backgroundUrl,
    isBusy,
    isStartPreviewDisabled,
    onSceneChange,
    onUpdateStartScreen,
    onDraftDirtyChange,
    onStartPreview,
  },
  ref,
) {
  const activeMutationRef = useRef<Promise<boolean> | null>(null);
  const startScreenRef = useRef(project.startScreen);
  const projectIdRef = useRef(project.id);
  const titleSourceRef = useRef(project.startScreen.title);
  const [titleDraft, setTitleDraft] = useState(
    project.startScreen.title,
  );
  const titleDraftRef = useRef(titleDraft);
  const [isMutating, setIsMutating] = useState(false);
  const controlsDisabled = isBusy || isMutating;
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const audioAssets = assets.filter((asset) => asset.type === 'audio');
  const sceneOptions = createEditorSceneOptions(project);
  const selectedBackground = imageAssets.find(
    (asset) => asset.id === project.startScreen.backgroundAssetId,
  );
  const selectedMusic = audioAssets.find(
    (asset) => asset.id === project.startScreen.musicAssetId,
  );

  startScreenRef.current = project.startScreen;
  titleDraftRef.current = titleDraft;

  useEffect(() => {
    const projectChanged = projectIdRef.current !== project.id;
    projectIdRef.current = project.id;
    const previousSource = titleSourceRef.current;
    titleSourceRef.current = project.startScreen.title;
    if (projectChanged) {
      titleDraftRef.current = project.startScreen.title;
      setTitleDraft(project.startScreen.title);
      return;
    }
    setTitleDraft((current) =>
      current === previousSource ? project.startScreen.title : current,
    );
  }, [project.id, project.startScreen.title]);

  useEffect(() => {
    onDraftDirtyChange(titleDraft !== project.startScreen.title);
  }, [onDraftDirtyChange, project.startScreen.title, titleDraft]);

  useEffect(
    () => () => onDraftDirtyChange(false),
    [onDraftDirtyChange],
  );

  const update = (
    title: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ): Promise<boolean> => {
    const normalizedTitle = normalizeTitleDraft(title);
    if (normalizedTitle !== titleDraftRef.current) {
      titleDraftRef.current = normalizedTitle;
      setTitleDraft(normalizedTitle);
    }
    if (activeMutationRef.current !== null) {
      return activeMutationRef.current;
    }
    if (
      normalizedTitle === startScreenRef.current.title &&
      backgroundAssetId === startScreenRef.current.backgroundAssetId &&
      musicAssetId === startScreenRef.current.musicAssetId
    ) {
      return Promise.resolve(true);
    }
    setIsMutating(true);
    const mutation = onUpdateStartScreen(
      normalizedTitle,
      backgroundAssetId,
      musicAssetId,
    )
      .catch((error: unknown) => {
        console.error('同步主界面表单失败', error);
        return false;
      })
      .finally(() => {
        if (activeMutationRef.current === mutation) {
          activeMutationRef.current = null;
          setIsMutating(false);
        }
      });
    activeMutationRef.current = mutation;
    return mutation;
  };

  useImperativeHandle(ref, () => ({
    flushPendingDraft: async () => {
      if (activeMutationRef.current) {
        return activeMutationRef.current;
      }
      const current = startScreenRef.current;
      return titleDraftRef.current === current.title
        ? true
        : update(
            titleDraftRef.current,
            current.backgroundAssetId,
            current.musicAssetId,
          );
    },
  }));

  return (
    <>
      <aside className="panel scene-panel start-screen-form-scene-panel">
        <div className="panel-heading">
          <h2>主界面</h2>
        </div>
        <label className="start-screen-form-field">
          <span>当前场景</span>
          <select
            aria-label="当前场景"
            value={START_SCREEN_SCENE_ID}
            disabled={controlsDisabled}
            onChange={(event) => {
              if (event.target.value !== START_SCREEN_SCENE_ID) {
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
          <strong>软件托管结构</strong>
          <p>开始游戏、选项和退出游戏由 Player 自动提供。</p>
        </div>
      </aside>

      <section
        className="preview-panel start-screen-form-preview"
        aria-label="主界面设计预览"
      >
        <div className="preview-toolbar">
          <button
            type="button"
            className="preview-play-button"
            aria-label="预览完整主界面"
            title="预览完整主界面"
            disabled={isStartPreviewDisabled}
            onClick={onStartPreview}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
        <div className="start-screen-design-preview">
          {backgroundUrl !== null ? (
            <img src={backgroundUrl} alt="" aria-hidden="true" />
          ) : null}
          <div className="start-screen-design-scrim" aria-hidden="true" />
          <div className="start-screen-design-card">
            <p>A VN ENGINE STORY</p>
            <h2>{titleDraft || '未命名游戏'}</h2>
            <div className="start-screen-design-actions">
              <span className="is-primary">▶ 开始游戏</span>
              <span>选项</span>
              <span>退出游戏</span>
            </div>
          </div>
        </div>
      </section>

      <aside className="panel inspector-panel start-screen-form-inspector">
        <div className="panel-heading">
          <h2>主界面内容</h2>
        </div>
        <form onSubmit={(event) => event.preventDefault()}>
          <label>
            游戏显示名称
            <input
              aria-label="主界面游戏名称"
              value={titleDraft}
              disabled={controlsDisabled}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                const current = startScreenRef.current;
                void update(
                  titleDraftRef.current,
                  current.backgroundAssetId,
                  current.musicAssetId,
                );
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  const savedTitle = startScreenRef.current.title;
                  titleDraftRef.current = savedTitle;
                  setTitleDraft(savedTitle);
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <label>
            背景图片
            <select
              aria-label="主界面背景图片"
              value={project.startScreen.backgroundAssetId ?? ''}
              disabled={controlsDisabled}
              onChange={(event) => {
                void update(
                  titleDraftRef.current,
                  event.target.value || null,
                  project.startScreen.musicAssetId,
                );
              }}
            >
              <option value="">无</option>
              {imageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.displayName}
                </option>
              ))}
              {project.startScreen.backgroundAssetId !== null &&
              selectedBackground === undefined ? (
                <option value={project.startScreen.backgroundAssetId}>
                  缺失图片（{project.startScreen.backgroundAssetId}）
                </option>
              ) : null}
            </select>
          </label>
          <label>
            背景音乐
            <select
              aria-label="主界面背景音乐"
              value={project.startScreen.musicAssetId ?? ''}
              disabled={controlsDisabled}
              onChange={(event) => {
                void update(
                  titleDraftRef.current,
                  project.startScreen.backgroundAssetId,
                  event.target.value || null,
                );
              }}
            >
              <option value="">无</option>
              {audioAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.displayName}
                </option>
              ))}
              {project.startScreen.musicAssetId !== null &&
              selectedMusic === undefined ? (
                <option value={project.startScreen.musicAssetId}>
                  缺失音频（{project.startScreen.musicAssetId}）
                </option>
              ) : null}
            </select>
          </label>
        </form>
        <p className="start-screen-form-help">
          白色选择框中的内容会同时反映到图形化编辑和完整预览。
        </p>
      </aside>
    </>
  );
});
