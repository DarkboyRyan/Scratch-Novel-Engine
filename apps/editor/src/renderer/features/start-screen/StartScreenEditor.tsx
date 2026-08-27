/**
 * 文件主要作用：在表单与积木模式间切换标题界面编辑器。
 * 包含实现：`StartScreenEditorHandle`、`StartScreenEditor`。
 */

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
import { useEditorLabels } from '../../i18n/editorLocalization';

type StartScreenEditorProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  isBusy: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onUpdateStartScreen: (
    title: string,
    eyebrow: string,
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
  const labels = useEditorLabels();
  const workspaceRef = useRef<StartScreenBlocklyWorkspaceHandle>(null);
  const [isChangingScene, setIsChangingScene] = useState(false);
  useImperativeHandle(ref, () => ({
    flushPendingDraft: () =>
      workspaceRef.current?.flushPendingDraft() ?? Promise.resolve(true),
  }));
  const sceneOptions = createEditorSceneOptions(project, labels);

  return (
    <main
      className="block-editor start-screen-editor"
      aria-labelledby="start-screen-editor-title"
    >
      <header className="block-editor-heading">
        <div>
          <h1 id="start-screen-editor-title">{labels.startScreen.editorTitle}</h1>
          <p>{labels.startScreen.editorHelp}</p>
        </div>

        <div className="block-editor-heading-controls">
          <label className="block-editor-scene-picker">
            <span>{labels.scenes.currentScene}</span>
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
            {labels.startScreen.managedStructure}
          </span>
          <button
            type="button"
            className="preview-play-button start-screen-preview-button"
            aria-label={labels.startScreen.previewFull}
            title={labels.startScreen.previewFull}
            disabled={isStartPreviewDisabled}
            onClick={onStartPreview}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
      </header>

      <section
        className="block-editor-workspace start-screen-editor-workspace"
        aria-label={labels.startScreen.workspace}
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
