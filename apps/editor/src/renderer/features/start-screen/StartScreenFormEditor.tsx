/**
 * 文件主要作用：提供标题上方文字、游戏名、背景图和背景音乐的表单配置界面。
 * 包含实现：`StartScreenFormEditor`。
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  createStartScreenThemePresentation,
  useAutoFitScale,
} from '@vnengine/player-ui';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../../shared/projectTypes';
import type { StartScreenEditorHandle } from './StartScreenEditor';
import {
  constrainStartScreenEyebrowInput,
  createEditorSceneOptions,
  normalizeStartScreenEyebrowInput,
  START_SCREEN_SCENE_ID,
  trimStartScreenAsciiWhitespace,
} from './startScreenScene';
import { useEditorLabels } from '../../i18n/editorLocalization';

type StartScreenFormEditorProps = {
  project: ProjectDocument;
  assets: AssetDocument[];
  backgroundUrl: string | null;
  isBusy: boolean;
  isStartPreviewDisabled: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onUpdateStartScreen: (
    title: string,
    eyebrow: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ) => Promise<boolean>;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

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
  const labels = useEditorLabels();
  const activeMutationRef = useRef<Promise<boolean> | null>(null);
  const startScreenRef = useRef(project.startScreen);
  const projectIdRef = useRef(project.id);
  const titleSourceRef = useRef(project.startScreen.title);
  const eyebrowSourceRef = useRef(project.startScreen.eyebrow);
  const [titleDraft, setTitleDraft] = useState(
    project.startScreen.title,
  );
  const titleDraftRef = useRef(titleDraft);
  const [eyebrowDraft, setEyebrowDraft] = useState(
    project.startScreen.eyebrow,
  );
  const eyebrowDraftRef = useRef(eyebrowDraft);
  const [isMutating, setIsMutating] = useState(false);
  const titleFit = useAutoFitScale<HTMLDivElement, HTMLDivElement>();
  const theme = createStartScreenThemePresentation(project.startScreen.style);
  const controlsDisabled = isBusy || isMutating;
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const audioAssets = assets.filter((asset) => asset.type === 'audio');
  const sceneOptions = createEditorSceneOptions(project, labels);
  const selectedBackground = imageAssets.find(
    (asset) => asset.id === project.startScreen.backgroundAssetId,
  );
  const selectedMusic = audioAssets.find(
    (asset) => asset.id === project.startScreen.musicAssetId,
  );

  startScreenRef.current = project.startScreen;
  titleDraftRef.current = titleDraft;
  eyebrowDraftRef.current = eyebrowDraft;

  useEffect(() => {
    const projectChanged = projectIdRef.current !== project.id;
    projectIdRef.current = project.id;
    const previousSource = titleSourceRef.current;
    const previousEyebrowSource = eyebrowSourceRef.current;
    titleSourceRef.current = project.startScreen.title;
    eyebrowSourceRef.current = project.startScreen.eyebrow;
    if (projectChanged) {
      titleDraftRef.current = project.startScreen.title;
      setTitleDraft(project.startScreen.title);
      eyebrowDraftRef.current = project.startScreen.eyebrow;
      setEyebrowDraft(project.startScreen.eyebrow);
      return;
    }
    setTitleDraft((current) =>
      current === previousSource ? project.startScreen.title : current,
    );
    setEyebrowDraft((current) =>
      current === previousEyebrowSource
        ? project.startScreen.eyebrow
        : current,
    );
  }, [
    project.id,
    project.startScreen.eyebrow,
    project.startScreen.title,
  ]);

  useEffect(() => {
    onDraftDirtyChange(
      titleDraft !== project.startScreen.title ||
        eyebrowDraft !== project.startScreen.eyebrow,
    );
  }, [
    eyebrowDraft,
    onDraftDirtyChange,
    project.startScreen.eyebrow,
    project.startScreen.title,
    titleDraft,
  ]);

  useEffect(
    () => () => onDraftDirtyChange(false),
    [onDraftDirtyChange],
  );

  const update = (
    title: string,
    eyebrow: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ): Promise<boolean> => {
    const normalizedTitle = trimStartScreenAsciiWhitespace(title);
    const normalizedEyebrow = normalizeStartScreenEyebrowInput(eyebrow);
    if (normalizedTitle !== titleDraftRef.current) {
      titleDraftRef.current = normalizedTitle;
      setTitleDraft(normalizedTitle);
    }
    if (normalizedEyebrow !== eyebrowDraftRef.current) {
      eyebrowDraftRef.current = normalizedEyebrow;
      setEyebrowDraft(normalizedEyebrow);
    }
    if (activeMutationRef.current !== null) {
      return activeMutationRef.current;
    }
    if (
      normalizedTitle === startScreenRef.current.title &&
      normalizedEyebrow === startScreenRef.current.eyebrow &&
      backgroundAssetId === startScreenRef.current.backgroundAssetId &&
      musicAssetId === startScreenRef.current.musicAssetId
    ) {
      return Promise.resolve(true);
    }
    setIsMutating(true);
    const mutation = onUpdateStartScreen(
      normalizedTitle,
      normalizedEyebrow,
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
      return titleDraftRef.current === current.title &&
        eyebrowDraftRef.current === current.eyebrow
        ? true
        : update(
            titleDraftRef.current,
            eyebrowDraftRef.current,
            current.backgroundAssetId,
            current.musicAssetId,
          );
    },
  }));

  return (
    <>
      <aside className="panel scene-panel start-screen-form-scene-panel">
        <div className="panel-heading">
          <h2>{labels.common.mainMenu}</h2>
        </div>
        <label className="start-screen-form-field">
          <span>{labels.scenes.currentScene}</span>
          <select
            aria-label={labels.scenes.currentScene}
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
          <strong>{labels.startScreen.managedStructureTitle}</strong>
          <p>{labels.startScreen.managedStructureHelp}</p>
        </div>
      </aside>

      <section
        className="preview-panel start-screen-form-preview"
        aria-label={labels.startScreen.designPreview}
      >
        <div className="preview-toolbar">
          <button
            type="button"
            className="preview-play-button"
            aria-label={labels.startScreen.previewFull}
            title={labels.startScreen.previewFull}
            disabled={isStartPreviewDisabled}
            onClick={onStartPreview}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
        <div
          className="start-screen-design-preview"
          style={theme.style}
          data-player-title-layout={theme.layout}
          data-player-title-background-fit={theme.backgroundFit}
        >
          {backgroundUrl !== null ? (
            <img src={backgroundUrl} alt="" aria-hidden="true" />
          ) : null}
          <div className="start-screen-design-scrim" aria-hidden="true" />
          <div ref={titleFit.containerRef} className="start-screen-design-fit">
            <div ref={titleFit.contentRef} className="start-screen-design-card">
              {eyebrowDraft ? <p>{eyebrowDraft}</p> : null}
              <h2>{titleDraft || labels.common.unnamedGame}</h2>
              <div className="start-screen-design-actions">
                <span className="is-primary">▶ {labels.startScreen.startGame}</span>
                <span>{labels.startScreen.loadGame}</span>
                <span>{labels.common.cgGallery}</span>
                <span>{labels.startScreen.options}</span>
                <span>{labels.startScreen.exitGame}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="panel inspector-panel start-screen-form-inspector">
        <div className="panel-heading">
          <h2>{labels.startScreen.content}</h2>
        </div>
        <form onSubmit={(event) => event.preventDefault()}>
          <label>
            {labels.startScreen.eyebrow}
            <input
              aria-label={labels.startScreen.eyebrowAria}
              value={eyebrowDraft}
              disabled={controlsDisabled}
              onChange={(event) => {
                const nextEyebrow = constrainStartScreenEyebrowInput(
                  event.target.value,
                );
                eyebrowDraftRef.current = nextEyebrow;
                setEyebrowDraft(nextEyebrow);
              }}
              onBlur={() => {
                const current = startScreenRef.current;
                void update(
                  titleDraftRef.current,
                  eyebrowDraftRef.current,
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
                  const savedEyebrow = startScreenRef.current.eyebrow;
                  eyebrowDraftRef.current = savedEyebrow;
                  setEyebrowDraft(savedEyebrow);
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <label>
            {labels.startScreen.displayName}
            <input
              aria-label={labels.startScreen.gameNameAria}
              value={titleDraft}
              disabled={controlsDisabled}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                const current = startScreenRef.current;
                void update(
                  titleDraftRef.current,
                  eyebrowDraftRef.current,
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
            {labels.startScreen.backgroundImage}
            <select
              aria-label={labels.startScreen.backgroundImageAria}
              value={project.startScreen.backgroundAssetId ?? ''}
              disabled={controlsDisabled}
              onChange={(event) => {
                void update(
                  titleDraftRef.current,
                  eyebrowDraftRef.current,
                  event.target.value || null,
                  project.startScreen.musicAssetId,
                );
              }}
            >
              <option value="">{labels.common.none}</option>
              {imageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.displayName}
                </option>
              ))}
              {project.startScreen.backgroundAssetId !== null &&
              selectedBackground === undefined ? (
                <option value={project.startScreen.backgroundAssetId}>
                  {labels.common.missingImage} ({project.startScreen.backgroundAssetId})
                </option>
              ) : null}
            </select>
          </label>
          <label>
            {labels.startScreen.backgroundMusic}
            <select
              aria-label={labels.startScreen.backgroundMusicAria}
              value={project.startScreen.musicAssetId ?? ''}
              disabled={controlsDisabled}
              onChange={(event) => {
                void update(
                  titleDraftRef.current,
                  eyebrowDraftRef.current,
                  project.startScreen.backgroundAssetId,
                  event.target.value || null,
                );
              }}
            >
              <option value="">{labels.common.none}</option>
              {audioAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.displayName}
                </option>
              ))}
              {project.startScreen.musicAssetId !== null &&
              selectedMusic === undefined ? (
                <option value={project.startScreen.musicAssetId}>
                  {labels.common.missingAudio} ({project.startScreen.musicAssetId})
                </option>
              ) : null}
            </select>
          </label>
        </form>
        <p className="start-screen-form-help">
          {labels.startScreen.formHelp}
        </p>
      </aside>
    </>
  );
});
