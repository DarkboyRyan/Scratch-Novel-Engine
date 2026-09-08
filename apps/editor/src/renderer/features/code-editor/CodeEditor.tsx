/**
 * 文件主要作用：编辑剧情 DSL，并为主界面/CG 画廊提供可编辑的安全主题代码。
 * 包含实现：`CodeEditorHandle`、`CodeEditor`、会话草稿、原子 Apply 与权威冲突保护。
 */

import {
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AssetDocument,
  CgGalleryStyleDocument,
  ProjectDocument,
  SceneContentDraft,
  SceneDocument,
  StartScreenStyleDocument,
} from '../../../shared/projectTypes';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
} from '../../../shared/projectTypes';
import {
  type EditorLabels,
  useEditorLabels,
} from '../../i18n/editorLocalization';
import {
  createEditorSceneOptions,
  CG_GALLERY_SCENE_ID,
  localizeGeneratedSceneName,
  START_SCREEN_SCENE_ID,
} from '../start-screen/startScreenScene';
import {
  type CodeProjectionDiagnostic,
  projectSceneToReadonlyCode,
  type ReadonlyCodeProjection,
} from './sceneCodeProjection';
import {
  type EditableSceneCodeDiagnostic,
  parseEditableSceneCode,
} from './sceneCodeParser';
import {
  formatCgGalleryStyleCode,
  formatStartScreenStyleCode,
  parseSurfaceStyleCode,
  type SurfaceStyleCodeDiagnostic,
  type SurfaceStyleCodeTarget,
} from './surfaceStyleCode';
import { getCodeTextareaEdit } from './codeTextareaEditing';

export type CodeEditorTarget =
  | { kind: 'story'; scene: SceneDocument }
  | { kind: 'start-screen' }
  | { kind: 'cg-gallery' };

export type CodeEditorDraft = {
  source: string;
  baseSource: string;
};

type CodeEditorProps = {
  project: ProjectDocument;
  target: CodeEditorTarget;
  assets: AssetDocument[];
  isBusy: boolean;
  onSceneChange: (sceneId: string) => Promise<void>;
  onSelectStartScreen: () => Promise<void>;
  onSelectCgGallery: () => Promise<void>;
  onUpdateStartScreenStyle: (
    style: StartScreenStyleDocument,
  ) => Promise<boolean>;
  onUpdateCgGalleryStyle: (
    style: CgGalleryStyleDocument,
  ) => Promise<boolean>;
  onReplaceSceneContent: (
    sceneId: string,
    draft: SceneContentDraft,
  ) => Promise<boolean>;
  draftKey: string;
  persistedDraft: CodeEditorDraft | null;
  onDraftChange: (key: string, draft: CodeEditorDraft | null) => void;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

export type CodeEditorHandle = {
  flushPendingDraft(): Promise<boolean>;
  prepareToLeave(): Promise<boolean>;
};

type SurfaceStylePanelHandle = CodeEditorHandle;

type CodeSourceTextareaProps = {
  ariaLabel: string;
  describedBy: string;
  disabled: boolean;
  value: string;
  onValueChange: (value: string) => void;
};

function CodeSourceTextarea({
  ariaLabel,
  describedBy,
  disabled,
  value,
  onValueChange,
}: CodeSourceTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const allowFocusExitRef = useRef(false);
  const pendingSelectionRef = useRef<{
    source: string;
    start: number;
    end: number;
    direction: 'forward' | 'backward' | 'none';
    scrollTop: number;
    scrollLeft: number;
  } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const textarea = textareaRef.current;
    if (pending === null || textarea === null) {
      return;
    }
    if (pending.source !== value) {
      pendingSelectionRef.current = null;
      return;
    }
    pendingSelectionRef.current = null;
    textarea.setSelectionRange(
      pending.start,
      pending.end,
      pending.direction,
    );
    textarea.scrollTop = pending.scrollTop;
    textarea.scrollLeft = pending.scrollLeft;
  }, [value]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled || event.defaultPrevented) {
      return;
    }
    if (
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }
    if (
      event.key === 'Escape' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      allowFocusExitRef.current = true;
      return;
    }
    if (event.key === 'Tab' && allowFocusExitRef.current) {
      allowFocusExitRef.current = false;
      return;
    }
    if (
      allowFocusExitRef.current &&
      (event.key === 'Shift' ||
        event.key === 'Control' ||
        event.key === 'Alt' ||
        event.key === 'Meta')
    ) {
      return;
    }
    allowFocusExitRef.current = false;
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const textarea = event.currentTarget;
    const edit = getCodeTextareaEdit({
      source: value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      key: event.key,
      shiftKey: event.shiftKey,
    });
    if (edit === null) {
      return;
    }

    event.preventDefault();
    if (edit.source === value) {
      return;
    }
    pendingSelectionRef.current = {
      source: edit.source,
      start: edit.selectionStart,
      end: edit.selectionEnd,
      direction: textarea.selectionDirection,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    };
    onValueChange(edit.source);
  };

  return (
    <textarea
      ref={textareaRef}
      className="code-editor-source code-editor-textarea"
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-keyshortcuts="Tab Shift+Tab Enter Escape"
      value={value}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      wrap="off"
      disabled={disabled}
      onBlur={() => {
        allowFocusExitRef.current = false;
      }}
      onChange={(event) => {
        allowFocusExitRef.current = false;
        onValueChange(event.target.value);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

type StoryCodePanelProps = {
  draftKey: string;
  persistedDraft: CodeEditorDraft | null;
  project: ProjectDocument;
  scene: SceneDocument;
  assets: AssetDocument[];
  projection: ReadonlyCodeProjection;
  isBusy: boolean;
  labels: EditorLabels;
  onReplaceSceneContent: (
    sceneId: string,
    draft: SceneContentDraft,
  ) => Promise<boolean>;
  onDraftChange: (key: string, draft: CodeEditorDraft | null) => void;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

type SurfaceStylePanelProps = {
  draftKey: string;
  persistedDraft: CodeEditorDraft | null;
  target: SurfaceStyleCodeTarget;
  style: StartScreenStyleDocument | CgGalleryStyleDocument;
  isBusy: boolean;
  labels: EditorLabels;
  onUpdateStartScreenStyle: (
    style: StartScreenStyleDocument,
  ) => Promise<boolean>;
  onUpdateCgGalleryStyle: (
    style: CgGalleryStyleDocument,
  ) => Promise<boolean>;
  onDraftChange: (key: string, draft: CodeEditorDraft | null) => void;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStartPreview: () => void;
};

function localizedProjectionDiagnostic(
  diagnostic: CodeProjectionDiagnostic,
  labels: EditorLabels,
): string {
  const summary = diagnostic.code === 'missingAsset'
    ? labels.codeEditor.missingAsset
    : diagnostic.code === 'assetTypeMismatch'
      ? labels.codeEditor.assetTypeMismatch
      : diagnostic.code === 'missingScene'
        ? labels.codeEditor.missingScene
        : labels.codeEditor.invalidStructure;
  return diagnostic.referenceId
    ? `${summary}: ${diagnostic.referenceId}`
    : summary;
}

function localizedStyleDiagnostic(
  diagnostic: SurfaceStyleCodeDiagnostic,
  labels: EditorLabels,
): string {
  const summary = labels.codeEditor.styleDiagnostics[diagnostic.code];
  const location = labels.codeEditor.line.replace(
    '{line}',
    String(diagnostic.line),
  );
  return diagnostic.field
    ? `${location} · ${summary}: ${diagnostic.field}`
    : `${location} · ${summary}`;
}

function localizedStoryDiagnostic(
  diagnostic: EditableSceneCodeDiagnostic,
  labels: EditorLabels,
): string {
  const location = labels.codeEditor.line.replace(
    '{line}',
    String(diagnostic.line),
  );
  const subject = diagnostic.field ?? diagnostic.reference;
  const summary = labels.codeEditor.storyDiagnostics[diagnostic.code];
  return subject
    ? `${location}:${diagnostic.column} · ${summary}: ${subject}`
    : `${location}:${diagnostic.column} · ${summary}`;
}

function formatSurfaceStyle(
  target: SurfaceStyleCodeTarget,
  style: StartScreenStyleDocument | CgGalleryStyleDocument,
): string {
  return target === 'start-screen'
    ? formatStartScreenStyleCode(style as StartScreenStyleDocument)
    : formatCgGalleryStyleCode(style as CgGalleryStyleDocument);
}

const StoryCodePanel = forwardRef<CodeEditorHandle, StoryCodePanelProps>(
  function StoryCodePanel(
    {
      draftKey,
      persistedDraft,
      project,
      scene,
      assets,
      projection,
      isBusy,
      labels,
      onReplaceSceneContent,
      onDraftChange,
      onDraftDirtyChange,
      onStartPreview,
    },
    ref,
  ) {
    const keyboardHelpId = useId();
    const authoritativeSource = projection.source;
    const [source, setSource] = useState(
      persistedDraft?.source ?? authoritativeSource,
    );
    const [baseSource, setBaseSource] = useState(
      persistedDraft?.baseSource ?? authoritativeSource,
    );
    const [conflict, setConflict] = useState(
      persistedDraft !== null &&
        persistedDraft.baseSource !== authoritativeSource,
    );
    const [isApplying, setIsApplying] = useState(false);
    const sourceRef = useRef(source);
    const baseSourceRef = useRef(baseSource);
    const authoritativeSourceRef = useRef(authoritativeSource);
    const pendingAuthoritySyncRef = useRef<{
      staleSource: string;
      acceptedSource: string;
    } | null>(null);
    const activeMutationRef = useRef<Promise<boolean> | null>(null);
    sourceRef.current = source;
    baseSourceRef.current = baseSource;
    authoritativeSourceRef.current = authoritativeSource;

    const parseSource = (candidate: string) => parseEditableSceneCode({
      source: candidate,
      scene,
      project,
      assets,
      previousProjection: projection,
    });
    const parsed = useMemo(
      () => parseEditableSceneCode({
        source,
        scene,
        project,
        assets,
        previousProjection: projection,
      }),
      [assets, project, projection, scene, source],
    );
    const dirty = source !== baseSource;

    useEffect(() => {
      const pendingAuthoritySync = pendingAuthoritySyncRef.current;
      if (
        pendingAuthoritySync !== null &&
        authoritativeSource === pendingAuthoritySync.staleSource
      ) {
        return;
      }
      if (pendingAuthoritySync !== null) {
        pendingAuthoritySyncRef.current = null;
      }
      if (sourceRef.current === baseSourceRef.current) {
        sourceRef.current = authoritativeSource;
        baseSourceRef.current = authoritativeSource;
        setSource(authoritativeSource);
        setBaseSource(authoritativeSource);
        setConflict(false);
        return;
      }
      if (authoritativeSource !== baseSourceRef.current) {
        setConflict(true);
      }
    }, [authoritativeSource]);

    useEffect(() => {
      onDraftChange(
        draftKey,
        dirty ? { source, baseSource } : null,
      );
      onDraftDirtyChange(dirty);
    }, [baseSource, dirty, draftKey, onDraftChange, onDraftDirtyChange, source]);

    const authorityMatchesBase = (): boolean => {
      const pendingAuthoritySync = pendingAuthoritySyncRef.current;
      return authoritativeSourceRef.current === baseSourceRef.current ||
        (
          pendingAuthoritySync !== null &&
          authoritativeSourceRef.current === pendingAuthoritySync.staleSource &&
          baseSourceRef.current === pendingAuthoritySync.acceptedSource
        );
    };

    const apply = (): Promise<boolean> => {
      if (activeMutationRef.current !== null) {
        return activeMutationRef.current;
      }
      const latestParsed = parseSource(sourceRef.current);
      if (!latestParsed.ok || conflict) {
        return Promise.resolve(false);
      }
      if (!authorityMatchesBase()) {
        setConflict(true);
        return Promise.resolve(false);
      }

      const mutationBaseSource = baseSourceRef.current;
      const canonicalSource = latestParsed.canonicalSource;
      if (canonicalSource === authoritativeSourceRef.current) {
        sourceRef.current = canonicalSource;
        baseSourceRef.current = canonicalSource;
        setSource(canonicalSource);
        setBaseSource(canonicalSource);
        setConflict(false);
        onDraftChange(draftKey, null);
        onDraftDirtyChange(false);
        return Promise.resolve(true);
      }

      setIsApplying(true);
      const mutation = onReplaceSceneContent(scene.id, latestParsed.draft)
        .then((updated) => {
          if (!updated) {
            return false;
          }
          const latestAuthoritativeSource = authoritativeSourceRef.current;
          const pendingAuthoritySync = pendingAuthoritySyncRef.current;
          const latestAuthorityIsKnownStale =
            pendingAuthoritySync !== null &&
            latestAuthoritativeSource === pendingAuthoritySync.staleSource &&
            mutationBaseSource === pendingAuthoritySync.acceptedSource;
          if (
            latestAuthoritativeSource !== mutationBaseSource &&
            latestAuthoritativeSource !== canonicalSource &&
            !latestAuthorityIsKnownStale
          ) {
            setConflict(true);
            return false;
          }
          pendingAuthoritySyncRef.current =
            latestAuthoritativeSource === canonicalSource
              ? null
              : {
                  staleSource: latestAuthoritativeSource,
                  acceptedSource: canonicalSource,
                };
          sourceRef.current = canonicalSource;
          baseSourceRef.current = canonicalSource;
          authoritativeSourceRef.current = canonicalSource;
          setSource(canonicalSource);
          setBaseSource(canonicalSource);
          setConflict(false);
          onDraftChange(draftKey, null);
          onDraftDirtyChange(false);
          return true;
        })
        .catch(() => false)
        .finally(() => {
          if (activeMutationRef.current === mutation) {
            activeMutationRef.current = null;
            setIsApplying(false);
          }
        });
      activeMutationRef.current = mutation;
      return mutation;
    };

    useImperativeHandle(ref, () => ({
      flushPendingDraft: apply,
      prepareToLeave: () => {
        const latestSource = sourceRef.current;
        const latestBaseSource = baseSourceRef.current;
        if (latestSource === latestBaseSource) {
          return Promise.resolve(true);
        }
        onDraftChange(draftKey, {
          source: latestSource,
          baseSource: latestBaseSource,
        });
        const latestParsed = parseSource(latestSource);
        if (!latestParsed.ok || conflict || !authorityMatchesBase()) {
          if (!authorityMatchesBase()) {
            setConflict(true);
          }
          return Promise.resolve(true);
        }
        return apply();
      },
    }));

    const disabled = isBusy || isApplying;
    const diagnostics = parsed.ok ? [] : parsed.diagnostics;

    return (
      <section
        className="code-editor-panel is-editable"
        aria-label={labels.codeEditor.source}
      >
        <div className="code-editor-notice">
          <div>
            <span>{labels.codeEditor.storyHelp}</span>
            <span id={keyboardHelpId}>
              {labels.codeEditor.keyboardHelp}
            </span>
          </div>
          <div className="code-editor-actions">
            <button
              type="button"
              className="secondary"
              disabled={disabled || (!dirty && !conflict)}
              onClick={() => {
                sourceRef.current = authoritativeSource;
                baseSourceRef.current = authoritativeSource;
                setSource(authoritativeSource);
                setBaseSource(authoritativeSource);
                setConflict(false);
                onDraftChange(draftKey, null);
                onDraftDirtyChange(false);
              }}
            >
              {labels.codeEditor.reloadAuthoritativeCode}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || !parsed.ok || conflict}
              onClick={() => {
                void (async () => {
                  if (await apply()) {
                    onStartPreview();
                  }
                })();
              }}
            >
              {labels.codeEditor.previewStory}
            </button>
            <button
              type="button"
              disabled={disabled || !dirty || !parsed.ok || conflict}
              onClick={() => void apply()}
            >
              {isApplying
                ? labels.codeEditor.applying
                : labels.codeEditor.applyCode}
            </button>
          </div>
        </div>

        <CodeSourceTextarea
          ariaLabel={labels.codeEditor.source}
          describedBy={keyboardHelpId}
          value={source}
          disabled={disabled}
          onValueChange={(nextSource) => {
            sourceRef.current = nextSource;
            setSource(nextSource);
            const nextDirty = nextSource !== baseSourceRef.current;
            onDraftChange(
              draftKey,
              nextDirty
                ? { source: nextSource, baseSource: baseSourceRef.current }
                : null,
            );
            onDraftDirtyChange(nextDirty);
          }}
        />

        {conflict ? (
          <p className="code-editor-conflict" role="alert">
            {labels.codeEditor.storyConflict}
          </p>
        ) : diagnostics.length > 0 &&
          (dirty || projection.diagnostics.length === 0) ? (
          <ul
            className="code-editor-diagnostics"
            aria-label={labels.codeEditor.diagnostics}
          >
            {diagnostics.map((entry, index) => (
              <li
                key={`${entry.code}:${entry.line}:${entry.column}:${index}`}
                className="is-error"
              >
                <strong className="code-editor-diagnostic-severity">
                  {labels.common.error}
                </strong>{' '}
                {localizedStoryDiagnostic(entry, labels)}
              </li>
            ))}
          </ul>
        ) : projection.diagnostics.length > 0 ? (
          <ul
            className="code-editor-diagnostics"
            aria-label={labels.codeEditor.diagnostics}
          >
            {projection.diagnostics.map((diagnostic, index) => (
              <li
                key={`${diagnostic.code}:${diagnostic.sourceId ?? index}`}
                className={`is-${diagnostic.severity}`}
              >
                <strong className="code-editor-diagnostic-severity">
                  {diagnostic.severity === 'warning'
                    ? labels.codeEditor.warning
                    : labels.common.error}
                </strong>{' '}
                {localizedProjectionDiagnostic(diagnostic, labels)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  },
);

const SurfaceStyleCodePanel = forwardRef<
  SurfaceStylePanelHandle,
  SurfaceStylePanelProps
>(function SurfaceStyleCodePanel(
  {
    draftKey,
    persistedDraft,
    target,
    style,
    isBusy,
    labels,
    onUpdateStartScreenStyle,
    onUpdateCgGalleryStyle,
    onDraftChange,
    onDraftDirtyChange,
    onStartPreview,
  },
  ref,
) {
  const keyboardHelpId = useId();
  const authoritativeSource = useMemo(
    () => formatSurfaceStyle(target, style),
    [style, target],
  );
  const [source, setSource] = useState(
    persistedDraft?.source ?? authoritativeSource,
  );
  const [baseSource, setBaseSource] = useState(
    persistedDraft?.baseSource ?? authoritativeSource,
  );
  const [conflict, setConflict] = useState(
    persistedDraft !== null &&
      persistedDraft.baseSource !== authoritativeSource,
  );
  const [isApplying, setIsApplying] = useState(false);
  const sourceRef = useRef(source);
  const baseSourceRef = useRef(baseSource);
  const authoritativeSourceRef = useRef(authoritativeSource);
  const pendingAuthoritySyncRef = useRef<{
    staleSource: string;
    acceptedSource: string;
  } | null>(null);
  const activeMutationRef = useRef<Promise<boolean> | null>(null);
  sourceRef.current = source;
  baseSourceRef.current = baseSource;
  authoritativeSourceRef.current = authoritativeSource;
  const parsed = useMemo(
    () => parseSurfaceStyleCode(source, target),
    [source, target],
  );
  const dirty = source !== baseSource;

  useEffect(() => {
    const pendingAuthoritySync = pendingAuthoritySyncRef.current;
    if (
      pendingAuthoritySync !== null &&
      authoritativeSource === pendingAuthoritySync.staleSource
    ) {
      return;
    }
    if (pendingAuthoritySync !== null) {
      pendingAuthoritySyncRef.current = null;
    }
    if (sourceRef.current === baseSourceRef.current) {
      sourceRef.current = authoritativeSource;
      baseSourceRef.current = authoritativeSource;
      setSource(authoritativeSource);
      setBaseSource(authoritativeSource);
      setConflict(false);
      return;
    }
    if (authoritativeSource !== baseSourceRef.current) {
      setConflict(true);
    }
  }, [authoritativeSource]);

  useEffect(() => {
    onDraftChange(
      draftKey,
      dirty ? { source, baseSource } : null,
    );
    onDraftDirtyChange(dirty);
  }, [baseSource, dirty, draftKey, onDraftChange, onDraftDirtyChange, source]);

  const authorityMatchesBase = (): boolean => {
    const pendingAuthoritySync = pendingAuthoritySyncRef.current;
    return authoritativeSourceRef.current === baseSourceRef.current ||
      (
        pendingAuthoritySync !== null &&
        authoritativeSourceRef.current === pendingAuthoritySync.staleSource &&
        baseSourceRef.current === pendingAuthoritySync.acceptedSource
      );
  };

  const apply = (): Promise<boolean> => {
    if (activeMutationRef.current !== null) {
      return activeMutationRef.current;
    }
    const latestParsed = parseSurfaceStyleCode(sourceRef.current, target);
    if (!latestParsed.ok || conflict) {
      return Promise.resolve(false);
    }
    if (!authorityMatchesBase()) {
      setConflict(true);
      return Promise.resolve(false);
    }
    const mutationBaseSource = baseSourceRef.current;
    const canonicalSource = formatSurfaceStyle(target, latestParsed.style);
    if (canonicalSource === authoritativeSourceRef.current) {
      sourceRef.current = canonicalSource;
      baseSourceRef.current = canonicalSource;
      setSource(canonicalSource);
      setBaseSource(canonicalSource);
      setConflict(false);
      onDraftChange(draftKey, null);
      onDraftDirtyChange(false);
      return Promise.resolve(true);
    }

    setIsApplying(true);
    const mutation = (target === 'start-screen'
      ? onUpdateStartScreenStyle(
          latestParsed.style as StartScreenStyleDocument,
        )
      : onUpdateCgGalleryStyle(
          latestParsed.style as CgGalleryStyleDocument,
        ))
      .then((updated) => {
        if (!updated) {
          return false;
        }
        const latestAuthoritativeSource = authoritativeSourceRef.current;
        const pendingAuthoritySync = pendingAuthoritySyncRef.current;
        const latestAuthorityIsKnownStale =
          pendingAuthoritySync !== null &&
          latestAuthoritativeSource === pendingAuthoritySync.staleSource &&
          mutationBaseSource === pendingAuthoritySync.acceptedSource;
        if (
          latestAuthoritativeSource !== mutationBaseSource &&
          latestAuthoritativeSource !== canonicalSource &&
          !latestAuthorityIsKnownStale
        ) {
          setConflict(true);
          return false;
        }
        pendingAuthoritySyncRef.current =
          latestAuthoritativeSource === canonicalSource
            ? null
            : {
                staleSource: latestAuthoritativeSource,
                acceptedSource: canonicalSource,
              };
        sourceRef.current = canonicalSource;
        baseSourceRef.current = canonicalSource;
        authoritativeSourceRef.current = canonicalSource;
        setSource(canonicalSource);
        setBaseSource(canonicalSource);
        setConflict(false);
        onDraftChange(draftKey, null);
        onDraftDirtyChange(false);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (activeMutationRef.current === mutation) {
          activeMutationRef.current = null;
          setIsApplying(false);
        }
      });
    activeMutationRef.current = mutation;
    return mutation;
  };

  useImperativeHandle(ref, () => ({
    flushPendingDraft: apply,
    prepareToLeave: () => {
      const latestSource = sourceRef.current;
      const latestBaseSource = baseSourceRef.current;
      if (latestSource === latestBaseSource) {
        return Promise.resolve(true);
      }
      onDraftChange(draftKey, {
        source: latestSource,
        baseSource: latestBaseSource,
      });
      const latestParsed = parseSurfaceStyleCode(latestSource, target);
      if (!latestParsed.ok || conflict || !authorityMatchesBase()) {
        if (!authorityMatchesBase()) {
          setConflict(true);
        }
        return Promise.resolve(true);
      }
      return apply();
    },
  }));

  const disabled = isBusy || isApplying;
  const diagnostics = parsed.ok ? [] : parsed.diagnostics;

  return (
    <section className="code-editor-panel is-editable" aria-label={labels.codeEditor.styleSource}>
      <div className="code-editor-notice">
        <div>
          <strong>{labels.codeEditor.editableStyle}</strong>
          <span>{labels.codeEditor.styleHelp}</span>
          <span id={keyboardHelpId}>
            {labels.codeEditor.keyboardHelp}
          </span>
        </div>
        <div className="code-editor-actions">
          <button
            type="button"
            className="secondary"
            disabled={disabled || conflict}
            onClick={() => {
              const defaults = target === 'start-screen'
                ? DEFAULT_START_SCREEN_STYLE
                : DEFAULT_CG_GALLERY_STYLE;
              setSource(formatSurfaceStyle(target, defaults));
              setConflict(false);
            }}
          >
            {labels.codeEditor.useDefaults}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || (!dirty && !conflict)}
            onClick={() => {
              sourceRef.current = authoritativeSource;
              baseSourceRef.current = authoritativeSource;
              setSource(authoritativeSource);
              setBaseSource(authoritativeSource);
              setConflict(false);
              onDraftChange(draftKey, null);
              onDraftDirtyChange(false);
            }}
          >
            {conflict
              ? labels.codeEditor.reloadAuthoritative
              : labels.common.cancel}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !parsed.ok || conflict}
            onClick={() => {
              void (async () => {
                if (await apply()) {
                  onStartPreview();
                }
              })();
            }}
          >
            {labels.codeEditor.previewPage}
          </button>
          <button
            type="button"
            disabled={disabled || !dirty || !parsed.ok || conflict}
            onClick={() => void apply()}
          >
            {isApplying
              ? labels.codeEditor.applying
              : labels.codeEditor.applyStyle}
          </button>
        </div>
      </div>

      <CodeSourceTextarea
        ariaLabel={labels.codeEditor.styleSource}
        describedBy={keyboardHelpId}
        value={source}
        disabled={disabled}
        onValueChange={(nextSource) => {
          sourceRef.current = nextSource;
          setSource(nextSource);
          const nextDirty = nextSource !== baseSourceRef.current;
          onDraftChange(
            draftKey,
            nextDirty
              ? { source: nextSource, baseSource: baseSourceRef.current }
              : null,
          );
          onDraftDirtyChange(nextDirty);
        }}
      />

      {conflict ? (
        <p className="code-editor-conflict" role="alert">
          {labels.codeEditor.styleConflict}
        </p>
      ) : diagnostics.length > 0 ? (
        <ul
          className="code-editor-diagnostics"
          aria-label={labels.codeEditor.diagnostics}
        >
          {diagnostics.map((entry, index) => (
            <li
              key={`${entry.code}:${entry.line}:${entry.field ?? index}`}
              className="is-error"
            >
              <strong className="code-editor-diagnostic-severity">
                {labels.common.error}
              </strong>{' '}
              {localizedStyleDiagnostic(entry, labels)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
});

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(
    {
      project,
      target,
      assets,
      isBusy,
      onSceneChange,
      onSelectStartScreen,
      onSelectCgGallery,
      onUpdateStartScreenStyle,
      onUpdateCgGalleryStyle,
      onReplaceSceneContent,
      draftKey,
      persistedDraft,
      onDraftChange,
      onDraftDirtyChange,
      onStartPreview,
    },
    ref,
  ) {
    const labels = useEditorLabels();
    const [isChangingScene, setIsChangingScene] = useState(false);
    const [currentDraftDirty, setCurrentDraftDirty] = useState(
      persistedDraft !== null,
    );
    const editablePanelRef = useRef<CodeEditorHandle>(null);
    const reportDraftDirty = useCallback((dirty: boolean): void => {
      setCurrentDraftDirty(dirty);
      onDraftDirtyChange(dirty);
    }, [onDraftDirtyChange]);
    const sceneOptions = createEditorSceneOptions(project, labels);
    const storyScene = target.kind === 'story' ? target.scene : null;
    const sceneIndex = storyScene === null
      ? -1
      : project.scenes.findIndex(
          (projectScene) => projectScene.id === storyScene.id,
        );
    const targetDisplayName = target.kind === 'start-screen'
      ? labels.common.mainMenu
      : target.kind === 'cg-gallery'
        ? labels.common.cgGallery
        : sceneIndex < 0
          ? target.scene.name
          : localizeGeneratedSceneName(target.scene.name, sceneIndex, labels);
    const targetId = target.kind === 'start-screen'
      ? START_SCREEN_SCENE_ID
      : target.kind === 'cg-gallery'
        ? CG_GALLERY_SCENE_ID
        : target.scene.id;
    const projection = useMemo(
      () => storyScene === null
        ? null
        : projectSceneToReadonlyCode({ project, scene: storyScene, assets }),
      [assets, project, storyScene],
    );

    useImperativeHandle(ref, () => ({
      flushPendingDraft: () =>
        editablePanelRef.current?.flushPendingDraft() ?? Promise.resolve(true),
      prepareToLeave: () =>
        editablePanelRef.current?.prepareToLeave() ?? Promise.resolve(true),
    }));

    return (
      <main className="code-editor" aria-labelledby="code-editor-title">
        <header className="code-editor-heading">
          <div>
            <h1 id="code-editor-title">{labels.codeEditor.title}</h1>
            <p>
              {labels.codeEditor.currentProject}: {project.name} · {targetDisplayName}
            </p>
          </div>

          <div className="code-editor-heading-controls">
            <label className="block-editor-scene-picker">
              <span>{labels.scenes.currentScene}</span>
              <select
                className="scene-select block-editor-scene-select"
                value={targetId}
                aria-label={labels.scenes.selectCurrentScene}
                disabled={isBusy || isChangingScene}
                onChange={(event) => {
                  const nextSceneId = event.target.value;
                  void (async () => {
                    setIsChangingScene(true);
                    try {
                      const prepared = await (
                        editablePanelRef.current?.prepareToLeave() ??
                        Promise.resolve(true)
                      );
                      if (!prepared) {
                        return;
                      }
                      await (nextSceneId === START_SCREEN_SCENE_ID
                        ? onSelectStartScreen()
                        : nextSceneId === CG_GALLERY_SCENE_ID
                          ? onSelectCgGallery()
                          : onSceneChange(nextSceneId));
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

            {currentDraftDirty ? (
              <div
                className="code-editor-statuses"
                aria-label={labels.codeEditor.localDraft}
              >
                <span className="code-editor-status is-readonly">
                  {labels.codeEditor.localDraft}
                </span>
              </div>
            ) : null}
          </div>
        </header>

        {target.kind === 'story' && projection !== null ? (
          <StoryCodePanel
            key={draftKey}
            ref={editablePanelRef}
            draftKey={draftKey}
            persistedDraft={persistedDraft}
            project={project}
            scene={target.scene}
            assets={assets}
            projection={projection}
            isBusy={isBusy}
            labels={labels}
            onReplaceSceneContent={onReplaceSceneContent}
            onDraftChange={onDraftChange}
            onDraftDirtyChange={reportDraftDirty}
            onStartPreview={onStartPreview}
          />
        ) : (
          <SurfaceStyleCodePanel
            key={draftKey}
            ref={editablePanelRef}
            draftKey={draftKey}
            persistedDraft={persistedDraft}
            target={target.kind === 'start-screen'
              ? 'start-screen'
              : 'cg-gallery'}
            style={target.kind === 'start-screen'
              ? project.startScreen.style
              : project.cgGallery.style}
            isBusy={isBusy}
            labels={labels}
            onUpdateStartScreenStyle={onUpdateStartScreenStyle}
            onUpdateCgGalleryStyle={onUpdateCgGalleryStyle}
            onDraftChange={onDraftChange}
            onDraftDirtyChange={reportDraftDirty}
            onStartPreview={onStartPreview}
          />
        )}
      </main>
    );
  },
);
