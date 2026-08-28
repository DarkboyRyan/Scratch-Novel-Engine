/**
 * 文件主要作用：管理场景选择与重命名、时间线节点选择及新增、排序、删除操作。
 * 包含实现：`ScenePanel`。
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import type {
  AssetDocument,
  ProjectDocument,
  SceneDocument,
  FormVisibleSceneNode,
} from '../../../shared/projectTypes';
import {
  CG_GALLERY_SCENE_ID,
  START_SCREEN_SCENE_ID,
} from '../start-screen/startScreenScene';
import { useEditorLabels } from '../../i18n/editorLocalization';
import {
  createFormLogicTree,
  createFormNodeMovePlans,
} from './formLogicTree';
import { formatCharacterEffect } from '../block-editor/blocks/characterEffectBlock';

type ScenePanelProps = {
  project: ProjectDocument;
  scene: SceneDocument;
  assets: AssetDocument[];
  selectedNodeId: string | null;
  isBusy: boolean;
  onAddScene: () => Promise<void>;
  editingSceneId: string | null;
  sceneNameDraft: string;
  sceneRenameError: string | null;
  isRenamingScene: boolean;
  onBeginSceneRename: (sceneId: string) => void;
  onSceneNameDraftChange: (name: string) => void;
  onCancelSceneRename: () => void;
  onCommitSceneRename: () => Promise<boolean>;
  onSelectScene: (sceneId: string) => Promise<void>;
  onSelectStartScreen?: () => Promise<void>;
  onSelectCgGallery?: () => Promise<void>;
  onSelectNode: (node: FormVisibleSceneNode) => Promise<void>;
  onInsertBackground: () => Promise<void>;
  onInsertSceneJump: () => Promise<void>;
  onMoveNode: (nodeId: string, direction: -1 | 1) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
};

export function ScenePanel({
  project,
  scene,
  assets,
  selectedNodeId,
  isBusy,
  onAddScene,
  editingSceneId,
  sceneNameDraft,
  sceneRenameError,
  isRenamingScene,
  onBeginSceneRename,
  onSceneNameDraftChange,
  onCancelSceneRename,
  onCommitSceneRename,
  onSelectScene,
  onSelectStartScreen,
  onSelectCgGallery,
  onSelectNode,
  onInsertBackground,
  onInsertSceneJump,
  onMoveNode,
  onDeleteNode,
}: ScenePanelProps) {
  const labels = useEditorLabels();
  const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);
  const sceneMenuRef = useRef<HTMLDivElement>(null);
  const sceneMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const sceneRenameInputRef = useRef<HTMLInputElement>(null);
  const cancelSceneRenameBlurRef = useRef(false);
  const pendingSceneRenameBlurTimerRef = useRef<number | null>(null);
  const activeSceneRenamePointersRef = useRef(new Set<number>());
  const pendingPointerBlurSubmitRef = useRef(false);
  const scheduleSceneRenameSubmitAfterBlurRef = useRef<() => void>(() => {});
  const latestSceneRenameContextRef = useRef({
    projectId: project.id,
    sceneId: scene.id,
    editingSceneId,
  });
  const previousSceneRenameRenderRef = useRef({
    projectId: project.id,
    sceneId: scene.id,
    editingSceneId,
  });
  const suppressSceneTriggerFocusRef = useRef(false);
  const pendingSceneTriggerFocusRef = useRef<{
    projectId: string;
    sceneId: string;
  } | null>(null);
  latestSceneRenameContextRef.current = {
    projectId: project.id,
    sceneId: scene.id,
    editingSceneId,
  };
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const audioAssets = assets.filter((asset) => asset.type === 'audio');
  const videoAssets = assets.filter((asset) => asset.type === 'video');
  const { treeEntries, storyNodes, nodeMovePlans } = useMemo(() => {
    const entries = createFormLogicTree(scene);
    const nodes = entries.flatMap((entry) =>
      entry.kind === 'node' ? [entry.node] : [],
    );
    return {
      treeEntries: entries,
      storyNodes: nodes,
      nodeMovePlans: createFormNodeMovePlans(scene),
    };
  }, [scene]);
  const nodeNumbers = new Map(
    storyNodes.map((node, index) => [node.id, index + 1]),
  );
  const hasLogicControls = storyNodes.some(
    (node) => node.type === 'logicIf' || node.type === 'logicRepeat',
  );
  const currentSceneNumber =
    project.scenes.findIndex((projectScene) => projectScene.id === scene.id) +
    1;
  const currentSceneLabel = `${labels.common.scene} ${currentSceneNumber}`;
  const showsSeparateSceneName =
    scene.name !== currentSceneLabel &&
    scene.name !== `场景 ${currentSceneNumber}`;
  const assetName = (assetId: string | null) =>
    assetId === null
      ? labels.resource.noBackground
      : (imageAssets.find((asset) => asset.id === assetId)?.displayName ??
        labels.common.missingImage);
  const audioName = (assetId: string | null) =>
    assetId === null
      ? labels.scenes.stopBackgroundMusic
      : (audioAssets.find((asset) => asset.id === assetId)?.displayName ??
        labels.common.missingAudio);
  const videoName = (assetId: string | null) =>
    assetId === null
      ? labels.scenes.noVideo
      : (videoAssets.find((asset) => asset.id === assetId)?.displayName ??
        labels.common.missingVideo);

  useEffect(() => {
    setIsSceneMenuOpen(false);
    cancelSceneRenameBlurRef.current = true;
  }, [project.id, scene.id]);

  useEffect(
    () => () => {
      if (pendingSceneRenameBlurTimerRef.current !== null) {
        window.clearTimeout(pendingSceneRenameBlurTimerRef.current);
        pendingSceneRenameBlurTimerRef.current = null;
      }
      activeSceneRenamePointersRef.current.clear();
      pendingPointerBlurSubmitRef.current = false;
    },
    [editingSceneId, project.id, scene.id],
  );

  useEffect(() => {
    if (editingSceneId !== scene.id) {
      return;
    }

    const trackPointerDown = (event: PointerEvent) => {
      activeSceneRenamePointersRef.current.add(event.pointerId);
    };
    const releasePointer = (event: PointerEvent) => {
      activeSceneRenamePointersRef.current.delete(event.pointerId);
      if (
        activeSceneRenamePointersRef.current.size === 0 &&
        pendingPointerBlurSubmitRef.current
      ) {
        pendingPointerBlurSubmitRef.current = false;
        scheduleSceneRenameSubmitAfterBlurRef.current();
      }
    };

    window.addEventListener('pointerdown', trackPointerDown, true);
    window.addEventListener('pointerup', releasePointer, true);
    window.addEventListener('pointercancel', releasePointer, true);
    return () => {
      window.removeEventListener('pointerdown', trackPointerDown, true);
      window.removeEventListener('pointerup', releasePointer, true);
      window.removeEventListener('pointercancel', releasePointer, true);
      activeSceneRenamePointersRef.current.clear();
      pendingPointerBlurSubmitRef.current = false;
    };
  }, [editingSceneId, project.id, scene.id]);

  useEffect(() => {
    if (editingSceneId !== scene.id) {
      return;
    }

    sceneRenameInputRef.current?.focus();
    sceneRenameInputRef.current?.select();
  }, [editingSceneId, scene.id]);

  useEffect(() => {
    const previous = previousSceneRenameRenderRef.current;
    const contextChanged =
      previous.projectId !== project.id || previous.sceneId !== scene.id;

    if (contextChanged) {
      pendingSceneTriggerFocusRef.current = null;
      suppressSceneTriggerFocusRef.current =
        previous.editingSceneId !== null || editingSceneId !== null;
    } else if (
      previous.editingSceneId !== scene.id &&
      editingSceneId === scene.id
    ) {
      suppressSceneTriggerFocusRef.current = false;
    } else if (
      previous.editingSceneId === scene.id &&
      editingSceneId !== scene.id
    ) {
      if (!suppressSceneTriggerFocusRef.current) {
        pendingSceneTriggerFocusRef.current = {
          projectId: project.id,
          sceneId: scene.id,
        };
      }
      suppressSceneTriggerFocusRef.current = false;
    } else if (editingSceneId === null) {
      suppressSceneTriggerFocusRef.current = false;
    }

    previousSceneRenameRenderRef.current = {
      projectId: project.id,
      sceneId: scene.id,
      editingSceneId,
    };

    const pendingFocus = pendingSceneTriggerFocusRef.current;
    if (
      pendingFocus?.projectId === project.id &&
      pendingFocus.sceneId === scene.id &&
      editingSceneId !== scene.id &&
      !isBusy
    ) {
      sceneMenuTriggerRef.current?.focus();
      pendingSceneTriggerFocusRef.current = null;
    }
  }, [editingSceneId, isBusy, project.id, scene.id]);

  useEffect(() => {
    if (!sceneRenameError || editingSceneId !== scene.id) {
      return;
    }

    window.queueMicrotask(() => {
      sceneRenameInputRef.current?.focus();
      sceneRenameInputRef.current?.select();
    });
  }, [editingSceneId, scene.id, sceneRenameError]);

  useEffect(() => {
    if (!isSceneMenuOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !sceneMenuRef.current?.contains(event.target)
      ) {
        setIsSceneMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', closeOnOutsideClick, true);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideClick, true);
    };
  }, [isSceneMenuOpen]);

  const startSceneRename = () => {
    if (isBusy || isRenamingScene) {
      return;
    }

    cancelSceneRenameBlurRef.current = false;
    if (pendingSceneRenameBlurTimerRef.current !== null) {
      window.clearTimeout(pendingSceneRenameBlurTimerRef.current);
      pendingSceneRenameBlurTimerRef.current = null;
    }
    activeSceneRenamePointersRef.current.clear();
    pendingPointerBlurSubmitRef.current = false;
    setIsSceneMenuOpen(false);
    onBeginSceneRename(scene.id);
  };

  const cancelSceneRenameFromPanel = () => {
    cancelSceneRenameBlurRef.current = true;
    if (pendingSceneRenameBlurTimerRef.current !== null) {
      window.clearTimeout(pendingSceneRenameBlurTimerRef.current);
      pendingSceneRenameBlurTimerRef.current = null;
    }
    activeSceneRenamePointersRef.current.clear();
    pendingPointerBlurSubmitRef.current = false;
    suppressSceneTriggerFocusRef.current = false;
    onCancelSceneRename();
  };

  const submitSceneRename = async () => {
    if (
      isBusy ||
      editingSceneId !== scene.id ||
      isRenamingScene
    ) {
      return;
    }
    await onCommitSceneRename();
  };

  const scheduleSceneRenameSubmitAfterBlur = () => {
    pendingPointerBlurSubmitRef.current = false;
    if (pendingSceneRenameBlurTimerRef.current !== null) {
      window.clearTimeout(pendingSceneRenameBlurTimerRef.current);
    }

    const scheduledContext = {
      projectId: project.id,
      sceneId: scene.id,
      editingSceneId,
    };
    pendingSceneRenameBlurTimerRef.current = window.setTimeout(() => {
      pendingSceneRenameBlurTimerRef.current = null;
      const latestContext = latestSceneRenameContextRef.current;
      if (
        latestContext.projectId !== scheduledContext.projectId ||
        latestContext.sceneId !== scheduledContext.sceneId ||
        latestContext.editingSceneId !== scheduledContext.editingSceneId
      ) {
        return;
      }
      void submitSceneRename();
    }, 0);
  };
  scheduleSceneRenameSubmitAfterBlurRef.current =
    scheduleSceneRenameSubmitAfterBlur;

  return (
    <aside className="panel scene-panel">
      <div className="scene-switcher">
        <div className="scene-menu" ref={sceneMenuRef}>
          {editingSceneId === scene.id ? (
            <div className="scene-rename-field">
              <input
                ref={sceneRenameInputRef}
                className="scene-rename-input"
                value={sceneNameDraft}
                aria-label={`${labels.scenes.sceneName}: ${labels.common.scene} ${currentSceneNumber}`}
                aria-describedby={
                  sceneRenameError ? 'scene-rename-error' : undefined
                }
                aria-invalid={sceneRenameError ? true : undefined}
                aria-busy={isRenamingScene}
                disabled={isBusy || isRenamingScene}
                onFocus={() => {
                  if (
                    activeSceneRenamePointersRef.current.size === 0 &&
                    !pendingPointerBlurSubmitRef.current
                  ) {
                    suppressSceneTriggerFocusRef.current = false;
                  }
                }}
                onChange={(event) => {
                  onSceneNameDraftChange(event.target.value);
                }}
                onBlur={() => {
                  if (cancelSceneRenameBlurRef.current) {
                    cancelSceneRenameBlurRef.current = false;
                    return;
                  }
                  if (isBusy || isRenamingScene) {
                    pendingPointerBlurSubmitRef.current = false;
                    if (pendingSceneRenameBlurTimerRef.current !== null) {
                      window.clearTimeout(
                        pendingSceneRenameBlurTimerRef.current,
                      );
                      pendingSceneRenameBlurTimerRef.current = null;
                    }
                    suppressSceneTriggerFocusRef.current = false;
                    return;
                  }
                  suppressSceneTriggerFocusRef.current = true;
                  if (activeSceneRenamePointersRef.current.size > 0) {
                    pendingPointerBlurSubmitRef.current = true;
                    return;
                  }
                  scheduleSceneRenameSubmitAfterBlur();
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    suppressSceneTriggerFocusRef.current = false;
                    pendingPointerBlurSubmitRef.current = false;
                    cancelSceneRenameBlurRef.current = true;
                    if (pendingSceneRenameBlurTimerRef.current !== null) {
                      window.clearTimeout(
                        pendingSceneRenameBlurTimerRef.current,
                      );
                      pendingSceneRenameBlurTimerRef.current = null;
                    }
                    void submitSceneRename().finally(() => {
                      cancelSceneRenameBlurRef.current = false;
                    });
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelSceneRenameFromPanel();
                  }
                }}
              />
              {sceneRenameError ? (
                <span
                  id="scene-rename-error"
                  className="scene-rename-error"
                  role="alert"
                >
                  {sceneRenameError}
                </span>
              ) : null}
            </div>
          ) : (
            <button
              ref={sceneMenuTriggerRef}
              type="button"
              className="scene-menu-trigger"
              aria-label={labels.scenes.selectCurrentScene}
              aria-haspopup="listbox"
              aria-expanded={isSceneMenuOpen}
              aria-keyshortcuts="F2"
              disabled={isBusy}
              title={`${scene.name} — ${labels.scenes.renameSceneHint}`}
              onClick={(event) => {
                if (event.detail > 1) {
                  return;
                }
                setIsSceneMenuOpen((open) => !open);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                startSceneRename();
              }}
              onKeyDown={(event) => {
                if (event.key === 'F2') {
                  event.preventDefault();
                  startSceneRename();
                } else if (event.key === 'Escape') {
                  setIsSceneMenuOpen(false);
                }
              }}
            >
              <span className="scene-menu-current-label">
                <span className="scene-menu-current-number">
                  {currentSceneLabel}
                </span>
                {showsSeparateSceneName ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="scene-menu-name-separator"
                    >
                      ·
                    </span>
                    <span className="scene-menu-current-name">
                      {scene.name}
                    </span>
                  </>
                ) : null}
              </span>
              <span aria-hidden="true" className="scene-menu-chevron">
                ▾
              </span>
            </button>
          )}

          {isSceneMenuOpen ? (
            <div className="scene-menu-list" role="listbox">
              {onSelectStartScreen ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  data-scene-id={START_SCREEN_SCENE_ID}
                  onClick={() => {
                    setIsSceneMenuOpen(false);
                    void onSelectStartScreen();
                  }}
                >
                  <strong>{labels.common.mainMenu}</strong>
                  <span>{labels.scenes.managedStartScreen}</span>
                </button>
              ) : null}
              {onSelectCgGallery ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  data-scene-id={CG_GALLERY_SCENE_ID}
                  onClick={() => {
                    setIsSceneMenuOpen(false);
                    void onSelectCgGallery();
                  }}
                >
                  <strong>{labels.common.cgGallery}</strong>
                  <span>{labels.scenes.cgGalleryHelp}</span>
                </button>
              ) : null}
              {project.scenes.map((projectScene, index) => (
                <button
                  key={projectScene.id}
                  type="button"
                  role="option"
                  aria-selected={projectScene.id === scene.id}
                  className={
                    projectScene.id === scene.id ? 'selected' : undefined
                  }
                  onClick={() => {
                    setIsSceneMenuOpen(false);
                    void onSelectScene(projectScene.id);
                  }}
                >
                  <strong>
                    {labels.common.scene} {index + 1}
                  </strong>
                  {projectScene.name !== `场景 ${index + 1}` ? (
                    <span>{projectScene.name}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="scene-inline-action"
          aria-label={labels.scenes.addScene}
          title={labels.scenes.addEmptyScene}
          disabled={isBusy}
          onClick={() => void onAddScene()}
        >
          <span aria-hidden="true">+</span> {labels.common.scene}
        </button>
        <button
          type="button"
          className="scene-inline-action scene-jump-inline-action"
          aria-label={labels.scenes.insertJump}
          disabled={isBusy || project.scenes.length < 2}
          title={
            project.scenes.length < 2
              ? labels.scenes.needsTwoScenes
              : labels.scenes.insertJump
          }
          onClick={() => void onInsertSceneJump()}
        >
          <span aria-hidden="true">+</span> {labels.scenes.jump}
        </button>
      </div>

      <div className="scene-status">
        <span>
          {project.scenes.length} {labels.scenes.sceneUnit}
        </span>
        <span>
          {storyNodes.length} {labels.scenes.storyNodeUnit}
        </span>
      </div>

      <div className="timeline-add-actions">
        <button
          type="button"
          className="timeline-add-background-button"
          disabled={isBusy}
          onClick={() => void onInsertBackground()}
        >
          <span aria-hidden="true">+</span> {labels.scenes.background}
        </button>
      </div>

      <ol className="dialogue-list timeline-list">
        {treeEntries.map((entry) => {
          if (entry.kind === 'branch') {
            return (
              <li
                key={entry.id}
                className="logic-branch-row"
                style={
                  {
                    '--logic-depth': entry.depth,
                  } as CSSProperties
                }
              >
                <span aria-hidden="true" className="logic-branch-line" />
                <strong>
                  {entry.branch === 'then'
                    ? labels.blockly.logicThen
                    : entry.branch === 'else'
                      ? labels.blockly.logicElse
                      : entry.branch === 'cgBody'
                        ? labels.blockly.cgDialogueBody
                        : labels.blockly.logicRepeatBody}
                </strong>
              </li>
            );
          }

          const { node } = entry;
          const index = (nodeNumbers.get(node.id) ?? 1) - 1;
          const movePlans = nodeMovePlans.get(node.id);
          const isStructuredControl =
            node.type === 'logicIf' ||
            node.type === 'logicRepeat' ||
            node.type === 'cgDisplay';
          const logicStyle = {
            '--logic-depth': entry.depth,
          } as CSSProperties;
          return (
            <li
              key={node.id}
              style={logicStyle}
              className={`${node.id === selectedNodeId ? 'selected' : ''}${
                node.type === 'background'
                  ? ' is-background-node'
                  : node.type === 'character'
                    ? ' is-character-node'
                    : node.type === 'sceneJump'
                      ? ' is-scene-jump-node'
                      : node.type === 'bgm'
                        ? ' is-bgm-node'
                        : node.type === 'video'
                          ? ' is-video-node'
                          : node.type === 'choice'
                            ? ' is-choice-node'
                            : node.type === 'variableSet' ||
                                node.type === 'variableChange'
                              ? ' is-variable-node'
                              : node.type === 'cgDisplay'
                                ? ' is-cg-display-node'
                                : isStructuredControl
                                  ? ' is-logic-node'
                                  : ''
              }`}
            >
              <button
                type="button"
                className="dialogue-list-item"
                onClick={() => void onSelectNode(node)}
              >
                <span className="dialogue-number">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <div>
                  {node.type === 'dialogue' ? (
                    <>
                      {node.speaker ? <strong>{node.speaker}</strong> : null}
                      <p>{node.text || labels.scenes.emptyDialogue}</p>
                    </>
                  ) : node.type === 'background' ? (
                    <>
                      <strong>{labels.scenes.backgroundChange}</strong>
                      <p>{assetName(node.assetId)}</p>
                    </>
                  ) : node.type === 'character' ? (
                    <>
                      <strong>
                        {labels.scenes.character} · {node.layer}{' '}
                        {labels.scenes.layer}
                      </strong>
                      <p>
                        {node.mode === 'clear'
                          ? labels.scenes.noPortrait
                          : node.assetId === null
                            ? labels.common.none
                            : assetName(node.assetId)}
                        {' · '}
                        {node.slot === 'left'
                          ? labels.scenes.left
                          : node.slot === 'center'
                            ? labels.scenes.center
                            : labels.scenes.right}
                        {node.effect ? (
                          <>
                            <br />
                            <span className="character-effect-summary">
                              {labels.scenes.characterEffect} ·{' '}
                              {formatCharacterEffect(node.effect, labels)}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </>
                  ) : node.type === 'sceneJump' ? (
                    <>
                      <strong>{labels.scenes.jumpScene}</strong>
                      <p>
                        {(() => {
                          const targetIndex = project.scenes.findIndex(
                            (projectScene) =>
                              projectScene.id === node.targetSceneId,
                          );
                          return targetIndex >= 0
                            ? `${labels.common.scene} ${targetIndex + 1}`
                            : labels.scenes.missingTargetScene;
                        })()}
                      </p>
                    </>
                  ) : node.type === 'bgm' ? (
                    <>
                      <strong>{labels.scenes.backgroundMusic}</strong>
                      <p>{audioName(node.assetId)}</p>
                    </>
                  ) : node.type === 'video' ? (
                    <>
                      <strong>{labels.scenes.playVideo}</strong>
                      <p>{videoName(node.assetId)}</p>
                    </>
                  ) : node.type === 'choice' ? (
                    <>
                      <strong>{labels.scenes.sceneOptions}</strong>
                      <p>
                        {node.options.length > 0
                          ? `${node.options.length} ${labels.scenes.optionUnit}`
                          : labels.scenes.noOptionsSkip}
                      </p>
                    </>
                  ) : node.type === 'variableSet' ? (
                    <>
                      <strong>{labels.blockly.setVariable}</strong>
                      <p>
                        {node.variableName} = {String(node.value)}
                      </p>
                    </>
                  ) : node.type === 'variableChange' ? (
                    <>
                      <strong>{labels.blockly.changeVariable}</strong>
                      <p>
                        {node.variableName} {node.amount >= 0 ? '+' : '−'}={' '}
                        {Math.abs(node.amount)}
                      </p>
                    </>
                  ) : node.type === 'logicIf' ? (
                    <>
                      <strong>{labels.blockly.logicIf}</strong>
                      <p>{formatLogicCondition(node.condition)}</p>
                    </>
                  ) : node.type === 'logicRepeat' ? (
                    <>
                      <strong>{labels.blockly.logicRepeat}</strong>
                      <p>
                        {node.count} {labels.blockly.logicTimes}
                      </p>
                    </>
                  ) : (
                    <>
                      <strong>{labels.blockly.displayCg}</strong>
                      <p>
                        {assetName(node.assetId)} · {node.leadInMs / 1000}{' '}
                        {labels.blockly.seconds}
                      </p>
                    </>
                  )}
                </div>
              </button>

              <div className="dialogue-item-actions">
                <button
                  type="button"
                  className="dialogue-move-button"
                  disabled={isBusy || hasLogicControls || !movePlans?.up}
                  aria-label={`${labels.scenes.moveUp}${labels.common.wordSeparator}${labels.scenes.nodeAriaPrefix}${index + 1}${labels.scenes.nodeAriaSuffix}`}
                  title={labels.scenes.moveUp}
                  onClick={() => void onMoveNode(node.id, -1)}
                >
                  ↑
                </button>

                <button
                  type="button"
                  className="dialogue-move-button"
                  disabled={isBusy || hasLogicControls || !movePlans?.down}
                  aria-label={`${labels.scenes.moveDown}${labels.common.wordSeparator}${labels.scenes.nodeAriaPrefix}${index + 1}${labels.scenes.nodeAriaSuffix}`}
                  title={labels.scenes.moveDown}
                  onClick={() => void onMoveNode(node.id, 1)}
                >
                  ↓
                </button>

                <button
                  type="button"
                  className="dialogue-delete-button"
                  aria-label={`${labels.scenes.delete}${labels.common.wordSeparator}${labels.scenes.nodeAriaPrefix}${index + 1}${labels.scenes.nodeAriaSuffix}`}
                  title={labels.scenes.deleteNode}
                  disabled={isBusy || isStructuredControl}
                  onClick={() => void onDeleteNode(node.id)}
                >
                  {labels.scenes.delete}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function formatLogicOperand(
  operand: Extract<
    FormVisibleSceneNode,
    { type: 'logicIf' }
  >['condition']['left'],
): string {
  if (operand.kind === 'variable') {
    return operand.name;
  }
  return typeof operand.value === 'string'
    ? `“${operand.value}”`
    : String(operand.value);
}

function formatLogicCondition(
  condition: Extract<FormVisibleSceneNode, { type: 'logicIf' }>['condition'],
): string {
  const symbols = {
    eq: '=',
    neq: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
  } as const;
  return `${formatLogicOperand(condition.left)} ${symbols[condition.operator]} ${formatLogicOperand(condition.right)}`;
}
