import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';
import {
  StartScreenBlocklyWorkspace,
  type StartScreenBlocklyWorkspaceHandle,
} from './StartScreenBlocklyWorkspace';
import {
  createEditorSceneOptions,
  START_SCREEN_SCENE_ID,
} from './startScreenScene';

type StartScreenEditorProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  isBusy: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onUpdateStartScreen: (
    title: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
  isStartPreviewDisabled: boolean;
  onStartPreview: () => void;
};

export type StartScreenEditorHandle = StartScreenBlocklyWorkspaceHandle;

export const StartScreenEditor = forwardRef<
  StartScreenEditorHandle,
  StartScreenEditorProps
>(function StartScreenEditor(
  {
    project,
    assets,
    isBusy,
    onSceneChange,
    onUpdateStartScreen,
    onDraftDirtyChange,
    isStartPreviewDisabled,
    onStartPreview,
  },
  ref,
) {
  const workspaceRef = useRef<StartScreenBlocklyWorkspaceHandle>(null);
  const [isChangingScene, setIsChangingScene] = useState(false);
  useImperativeHandle(ref, () => ({
    flushPendingDraft: () =>
      workspaceRef.current?.flushPendingDraft() ?? Promise.resolve(true),
  }));
  const sceneOptions = createEditorSceneOptions(project);

  return (
    <main
      className="block-editor start-screen-editor"
      aria-labelledby="start-screen-editor-title"
    >
      <header className="block-editor-heading">
        <div>
          <h1 id="start-screen-editor-title">主界面编辑器</h1>
          <p>
            软件托管结构 · 使用白色下拉框选择素材，也可拖入对应积木
          </p>
        </div>

        <div className="block-editor-heading-controls">
          <label className="block-editor-scene-picker">
            <span>当前场景</span>
            <select
              className="scene-select block-editor-scene-select"
              value={START_SCREEN_SCENE_ID}
              disabled={isBusy || isChangingScene}
              onChange={(event) => {
                const nextSceneId = event.target.value;
                if (nextSceneId === START_SCREEN_SCENE_ID) {
                  return;
                }
                void (async () => {
                  setIsChangingScene(true);
                  try {
                    const flushed =
                      await (workspaceRef.current?.flushPendingDraft() ??
                        true);
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

          <span className="block-editor-sync-badge">
            主界面结构由软件管理
          </span>
          <button
            type="button"
            className="preview-play-button start-screen-preview-button"
            aria-label="预览完整主界面"
            title="预览完整主界面"
            disabled={isStartPreviewDisabled}
            onClick={onStartPreview}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
      </header>

      <section
        className="block-editor-workspace start-screen-editor-workspace"
        aria-label="主界面积木工作区"
      >
        <StartScreenBlocklyWorkspace
          ref={workspaceRef}
          projectId={project.id}
          startScreen={project.startScreen}
          assets={assets}
          isBusy={isBusy}
          onUpdateStartScreen={onUpdateStartScreen}
          onDraftDirtyChange={onDraftDirtyChange}
        />
      </section>
    </main>
  );
});
