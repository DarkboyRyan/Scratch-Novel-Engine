/**
 * 文件主要作用：组织编辑器主界面的项目会话、编辑模式、预览与全局对话框状态。
 * 包含实现：`App`。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  type EditorLanguage,
  type EditorSettings,
} from '../shared/editorSettingsProtocol';
import type { GameExportRequest } from '../shared/exportProtocol';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isImageScalePercent,
} from '../shared/projectTypes';
import type { SceneDocument } from '../shared/projectTypes';
import type { EditorMode } from './application/editorMode';
import type { WorkspaceSection } from './application/editorSection';
import {
  resolveEditorAssetPreviewUrl,
  resolveEditorMediaUrl,
} from './application/editorMediaGateway';
import { subscribeEditorProjectFileCommands } from './application/editorPlatformGateway';
import { ErrorDialog } from './components/ErrorDialog';
import { CreateProjectDialog } from './components/CreateProjectDialog';
import { RendererErrorBoundary } from './components/RendererErrorBoundary';
import { Toolbar } from './components/Toolbar';
import {
  BlockEditor,
  type BlockEditorHandle,
} from './features/block-editor/BlockEditor';
import type { BlockEditorLayoutStore } from './features/block-editor/blockEditorLayout';
import {
  CodeEditor,
  type CodeEditorDraft,
  type CodeEditorHandle,
} from './features/code-editor/CodeEditor';
import { AssetManager } from './features/assets/AssetManager';
import { useAssetPreviewUrls } from './features/assets/useAssetPreviewUrls';
import { FormEditor } from './features/form-editor/FormEditor';
import { useFormEditor } from './features/form-editor/useFormEditor';
import { deriveTimelinePreview } from './features/form-editor/timelinePreview';
import { GamePreview } from './features/game-preview/GamePreview';
import { useGamePreview } from './features/game-preview/useGamePreview';
import {
  CgGalleryEditor,
} from './features/cg-gallery/CgGalleryEditor';
import {
  CgGalleryFormEditor,
} from './features/cg-gallery/CgGalleryFormEditor';
import type { CgGalleryEditorHandle } from './features/cg-gallery/CgGalleryBlocklyWorkspace';
import {
  StartScreenEditor,
  type StartScreenEditorHandle,
} from './features/start-screen/StartScreenEditor';
import { StartScreenFormEditor } from './features/start-screen/StartScreenFormEditor';
import {
  editorSurfaceReducer,
  CG_GALLERY_SCENE_ID,
  initialEditorSurface,
  START_SCREEN_SCENE_ID,
  updateStartScreenFromLatest,
} from './features/start-screen/startScreenScene';
import { useEngineProject } from './hooks/useEngineProject';
import { useEditorSettings } from './hooks/useEditorSettings';
import {
  EditorI18nProvider,
  useEditorLabels,
} from './i18n/editorLocalization';
import { prepareProjectSave } from './projectSavePreparation';
import { projectWindowTitle } from './projectSessionPresentation';

type EditorApplicationProps = {
  settings: EditorSettings;
  isSettingsSaving: boolean;
  settingsSaveFailed: boolean;
  settingsRestartRequired: boolean;
  onLanguageChange: (language: EditorLanguage) => Promise<void>;
  onOpenSettings: () => void;
};

type SceneBackgroundScaleDraft = {
  projectId: string;
  sceneId: string;
  value: string;
};

function parseImageScaleDraft(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const scalePercent = Number(value);
  return isImageScalePercent(scalePercent) ? scalePercent : null;
}

function projectScaleDraftsOntoPreviewScene(
  scene: SceneDocument,
  sceneScalePercent: number | null,
  selectedNodeId: string | null,
  selectedNodeScalePercent: number | null,
): SceneDocument {
  const backgroundScalePercent =
    scene.backgroundAssetId !== null && sceneScalePercent !== null
      ? sceneScalePercent
      : scene.backgroundScalePercent;
  let nodes = scene.nodes;

  if (selectedNodeId !== null && selectedNodeScalePercent !== null) {
    const selectedNodeIndex = scene.nodes.findIndex(
      (node) => node.id === selectedNodeId,
    );
    const selectedNode = scene.nodes[selectedNodeIndex];
    const selectedNodeSupportsScale =
      (selectedNode?.type === 'background' &&
        selectedNode.assetId !== null) ||
      (selectedNode?.type === 'character' &&
        selectedNode.mode === 'show' &&
        selectedNode.assetId !== null);

    if (
      selectedNodeSupportsScale &&
      selectedNode.scalePercent !== selectedNodeScalePercent
    ) {
      nodes = [...scene.nodes];
      nodes[selectedNodeIndex] = {
        ...selectedNode,
        scalePercent: selectedNodeScalePercent,
      };
    }
  }

  if (
    backgroundScalePercent === scene.backgroundScalePercent &&
    nodes === scene.nodes
  ) {
    return scene;
  }
  return { ...scene, backgroundScalePercent, nodes };
}

export function EditorApplication({
  settings,
  isSettingsSaving,
  settingsSaveFailed,
  settingsRestartRequired,
  onLanguageChange,
  onOpenSettings,
}: EditorApplicationProps) {
  const labels = useEditorLabels();
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const [workspaceSection, setWorkspaceSection] =
    useState<WorkspaceSection>('dialogue');
  const blockEditorLayouts =
    useRef<BlockEditorLayoutStore>(new Map());
  const blockEditorRef = useRef<BlockEditorHandle>(null);
  const codeEditorRef = useRef<CodeEditorHandle>(null);
  const startScreenEditorRef = useRef<StartScreenEditorHandle>(null);
  const cgGalleryEditorRef = useRef<CgGalleryEditorHandle>(null);
  const engine = useEngineProject();
  const editor = useFormEditor(engine);
  const gamePreview = useGamePreview();
  const { project, scene } = editor;
  const [editorSurface, dispatchEditorSurface] = useReducer(
    editorSurfaceReducer,
    undefined,
    initialEditorSurface,
  );
  const isStartScreenSelected = editorSurface === 'start-screen';
  const isCgGallerySelected = editorSurface === 'cg-gallery';
  const isSyntheticSurfaceSelected =
    isStartScreenSelected || isCgGallerySelected;
  const assetPreviewUrls = useAssetPreviewUrls(
    project?.id ?? null,
    engine.projectGeneration,
    engine.assets,
    resolveEditorAssetPreviewUrl,
  );
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState(
    labels.app.untitledProject,
  );
  const [blockDraftDirty, setBlockDraftDirty] = useState(false);
  const [codeDraftDirty, setCodeDraftDirty] = useState(false);
  const codeDraftsRef = useRef<Map<string, CodeEditorDraft>>(new Map());
  const codeDraftSessionRef = useRef(0);
  const [sceneBackgroundScaleDraft, setSceneBackgroundScaleDraftState] =
    useState<SceneBackgroundScaleDraft | null>(null);
  const sceneBackgroundScaleDraftRef =
    useRef<SceneBackgroundScaleDraft | null>(null);
  const sceneBackgroundScaleCommitRef = useRef<Promise<boolean> | null>(null);
  const projectNameCommitRef = useRef<Promise<boolean> | null>(null);
  const projectNameDraftDirty = Boolean(
    project &&
      isRenamingProject &&
      projectNameDraft !== project.name,
  );
  const activeSceneBackgroundScaleDraft =
    project && scene && !isSyntheticSurfaceSelected &&
      sceneBackgroundScaleDraft?.projectId === project.id &&
      sceneBackgroundScaleDraft.sceneId === scene.id
      ? sceneBackgroundScaleDraft
      : null;
  const sceneBackgroundScaleDraftValue =
    activeSceneBackgroundScaleDraft?.value ??
      String(scene?.backgroundScalePercent ?? DEFAULT_IMAGE_SCALE_PERCENT);
  const sceneBackgroundScaleDraftInvalid =
    !isSyntheticSurfaceSelected && scene?.backgroundAssetId !== null &&
      parseImageScaleDraft(sceneBackgroundScaleDraftValue) === null;
  const sceneBackgroundScaleDraftDirty = Boolean(
    scene && activeSceneBackgroundScaleDraft &&
      activeSceneBackgroundScaleDraft.value !==
        String(scene.backgroundScalePercent),
  );
  const isDirty =
    engine.session.isDirty ||
    editor.draftDirty ||
    projectNameDraftDirty ||
    blockDraftDirty ||
    codeDraftDirty ||
    sceneBackgroundScaleDraftDirty;

  const updateCodeDraft = useCallback(
    (key: string, draft: CodeEditorDraft | null): void => {
      if (draft === null) {
        codeDraftsRef.current.delete(key);
      } else {
        codeDraftsRef.current.set(key, draft);
      }
      setCodeDraftDirty(codeDraftsRef.current.size > 0);
    },
    [],
  );
  const syncCodeDraftDirty = useCallback((): void => {
    setCodeDraftDirty(codeDraftsRef.current.size > 0);
  }, []);
  const latestActionsRef = useRef({
    create: async () => {},
    open: async () => {},
    save: async () => {},
  });

  useEffect(() => {
    sceneBackgroundScaleDraftRef.current = null;
    setSceneBackgroundScaleDraftState(null);
  }, [
    engine.projectGeneration,
    isSyntheticSurfaceSelected,
    project?.id,
    scene?.id,
  ]);

  const handleCreateProject = async () => {
    setNewProjectName(labels.app.untitledProject);
    setIsCreateProjectOpen(true);
  };

  const confirmCreateProject = async () => {
    const normalizedName = newProjectName.trim();
    if (!normalizedName) {
      engine.setEngineMessage(labels.app.projectNameRequired);
      return;
    }

    // 新项目拥有独立窗口和独立 C++ 后端，当前项目不会被替换。
    const opened = await engine.createProject(normalizedName);
    if (opened) {
      setIsCreateProjectOpen(false);
    }
  };

  const handleOpenProject = async () => {
    if (
      isDirty &&
      !window.confirm(labels.app.confirmOpenWithUnsavedChanges)
    ) {
      return;
    }

    const status = await engine.openProject();
    if (status === 'opened') {
      codeDraftsRef.current.clear();
      codeDraftSessionRef.current += 1;
      setIsRenamingProject(false);
      setBlockDraftDirty(false);
      setCodeDraftDirty(false);
      editor.resetEditorState();
      blockEditorLayouts.current.clear();
      setEditorMode('form');
      setWorkspaceSection('dialogue');
      dispatchEditorSurface({ type: 'project-loaded' });
    }
  };

  const commitProjectName = async (): Promise<boolean> => {
    if (!project || !isRenamingProject) {
      return true;
    }

    if (projectNameCommitRef.current) {
      return projectNameCommitRef.current;
    }

    const commit = async (): Promise<boolean> => {
      const normalizedName = projectNameDraft.trim();
      if (normalizedName === project.name) {
        setProjectNameDraft(project.name);
        setIsRenamingProject(false);
        return true;
      }

      // 空名称也发送给 C++，由领域层给出统一错误并保持编辑状态。
      const renamed = await engine.renameProject(normalizedName);
      if (renamed) {
        setProjectNameDraft(normalizedName);
        setIsRenamingProject(false);
      }
      return renamed;
    };

    const pendingCommit = commit();
    projectNameCommitRef.current = pendingCommit;
    try {
      return await pendingCommit;
    } finally {
      projectNameCommitRef.current = null;
    }
  };

  const setSceneBackgroundScaleDraft = (value: string): void => {
    if (!project || !scene || isSyntheticSurfaceSelected) {
      return;
    }
    const nextDraft: SceneBackgroundScaleDraft = {
      projectId: project.id,
      sceneId: scene.id,
      value,
    };
    sceneBackgroundScaleDraftRef.current = nextDraft;
    setSceneBackgroundScaleDraftState(nextDraft);
  };

  const clearCommittedSceneBackgroundScaleDraft = (
    owner: Pick<SceneBackgroundScaleDraft, 'projectId' | 'sceneId'>,
    committedValue: string,
  ): void => {
    const matches = (candidate: SceneBackgroundScaleDraft | null) =>
      candidate?.projectId === owner.projectId &&
      candidate.sceneId === owner.sceneId &&
      candidate.value === committedValue;
    if (matches(sceneBackgroundScaleDraftRef.current)) {
      sceneBackgroundScaleDraftRef.current = null;
    }
    setSceneBackgroundScaleDraftState(
      (current) => matches(current) ? null : current,
    );
  };

  const commitSceneBackgroundScaleDraft = async (): Promise<boolean> => {
    if (sceneBackgroundScaleCommitRef.current) {
      return sceneBackgroundScaleCommitRef.current;
    }
    if (!project || !scene || isSyntheticSurfaceSelected) {
      return true;
    }

    const owner = { projectId: project.id, sceneId: scene.id };
    const currentDraft = sceneBackgroundScaleDraftRef.current;
    const rawValue =
      currentDraft?.projectId === project.id &&
        currentDraft.sceneId === scene.id
        ? currentDraft.value
        : String(scene.backgroundScalePercent);
    if (scene.backgroundAssetId === null) {
      clearCommittedSceneBackgroundScaleDraft(owner, rawValue);
      return true;
    }
    const scalePercent = parseImageScaleDraft(rawValue);
    if (scalePercent === null) {
      return false;
    }
    if (scalePercent === scene.backgroundScalePercent) {
      clearCommittedSceneBackgroundScaleDraft(owner, rawValue);
      return true;
    }

    const commit = (async (): Promise<boolean> => {
      const saved = await engine.setSceneBackground(
        scene.id,
        scene.backgroundAssetId,
        scalePercent,
      );
      if (!saved) {
        return false;
      }
      clearCommittedSceneBackgroundScaleDraft(owner, rawValue);
      return true;
    })();
    sceneBackgroundScaleCommitRef.current = commit;
    try {
      return await commit;
    } finally {
      if (sceneBackgroundScaleCommitRef.current === commit) {
        sceneBackgroundScaleCommitRef.current = null;
      }
    }
  };

  const prepareEditorEdits = async (): Promise<boolean> => {
    // 先提交当前正在编辑的视图，再提交项目名，最后才写文件。
    // Blockly 必须第一个 flush：项目重命名返回的 C++ 快照会重绘
    // workspace，如果先重命名，可能把仍在输入框中的最新文字覆盖。
    const prepared = await prepareProjectSave({
      editorMode,
      flushBlockDraft: () =>
        isCgGallerySelected
          ? (cgGalleryEditorRef.current?.flushPendingDraft() ??
            Promise.resolve(true))
          : isStartScreenSelected
          ? (startScreenEditorRef.current?.flushPendingDraft() ??
            Promise.resolve(true))
          : (blockEditorRef.current?.flushPendingDraft() ??
            Promise.resolve(true)),
      flushCodeDraft: () =>
        codeEditorRef.current?.flushPendingDraft() ?? Promise.resolve(true),
      hasUnappliedCodeDrafts: () => codeDraftsRef.current.size > 0,
      commitProjectName,
      commitFormDraft: () =>
        isCgGallerySelected
          ? (cgGalleryEditorRef.current?.flushPendingDraft() ??
            Promise.resolve(true))
          : isStartScreenSelected
          ? (startScreenEditorRef.current?.flushPendingDraft() ??
            Promise.resolve(true))
          : editor.commitPendingDraft(),
    });

    if (
      prepared &&
      (isSyntheticSurfaceSelected || editorMode === 'blocks')
    ) {
      setBlockDraftDirty(false);
    }
    if (prepared && editorMode === 'code') {
      setCodeDraftDirty(codeDraftsRef.current.size > 0);
    }
    if (!prepared && codeDraftsRef.current.size > 0) {
      engine.setEngineMessage(labels.codeEditor.unappliedDraftsBlockAction);
    }
    return prepared;
  };

  const prepareEditorEditsForLeave = async (): Promise<boolean> => {
    // 离开 Code 与保存/导出的边界不同：有效代码仍会先提交；语法错误
    // 或并发冲突只保留在窗口内草稿仓库，不进入 C++，也不把用户锁在
    // 当前视图。Form/Blockly 因而始终只读取最后一次成功的权威快照。
    const activeDraftPrepared = editorMode === 'blocks'
      ? await (isCgGallerySelected
        ? (cgGalleryEditorRef.current?.flushPendingDraft() ?? true)
        : isStartScreenSelected
          ? (startScreenEditorRef.current?.flushPendingDraft() ?? true)
          : (blockEditorRef.current?.flushPendingDraft() ?? true))
      : editorMode === 'code'
        ? await (codeEditorRef.current?.prepareToLeave() ?? true)
        : true;
    if (!activeDraftPrepared || !(await commitProjectName())) {
      return false;
    }
    if (editorMode === 'form') {
      const committed = await (isCgGallerySelected
        ? (cgGalleryEditorRef.current?.flushPendingDraft() ?? true)
        : isStartScreenSelected
          ? (startScreenEditorRef.current?.flushPendingDraft() ?? true)
          : editor.commitPendingDraft());
      if (!committed) {
        return false;
      }
    }
    if (editorMode === 'blocks') {
      setBlockDraftDirty(false);
    }
    setCodeDraftDirty(codeDraftsRef.current.size > 0);
    return true;
  };

  const prepareCurrentEdits = async (): Promise<boolean> => {
    if (!(await prepareEditorEdits())) {
      return false;
    }
    return commitSceneBackgroundScaleDraft();
  };

  const prepareCurrentEditsForLeave = async (): Promise<boolean> => {
    if (!(await prepareEditorEditsForLeave())) {
      return false;
    }
    return commitSceneBackgroundScaleDraft();
  };

  const prepareResourceWorkspaceOperation = async (): Promise<boolean> => {
    if (workspaceSection === 'resources') {
      // 剧情编辑器在进入资源工作区时已经 flush。资源页
      // 不能产生剧情草稿，此时只需处理工具栏中的项目名草稿。
      return commitProjectName();
    }
    return prepareCurrentEditsForLeave();
  };

  const prepareResourceWorkspaceMutation = async (): Promise<boolean> => {
    if (workspaceSection !== 'resources') {
      return prepareCurrentEdits();
    }
    // Import only adds a new name, so an isolated invalid Code draft can stay
    // off-screen. Rename/delete can invalidate names inside such a draft and
    // therefore use the same strict boundary as save/export.
    if (codeDraftsRef.current.size > 0) {
      engine.setEngineMessage(labels.codeEditor.unappliedDraftsBlockAction);
      return false;
    }
    return commitProjectName();
  };

  const handleSaveProject = async () => {
    await engine.saveProject(prepareCurrentEdits);
  };

  const handleExportGame = async (
    request: GameExportRequest,
  ): Promise<void> => {
    if (engine.isBusy || gamePreview.session) {
      return;
    }

    await engine.exportGame(prepareCurrentEdits, request);
  };

  const handleStartPreview = async (): Promise<void> => {
    if (engine.isBusy || gamePreview.session) {
      return;
    }
    const previewSceneId = isSyntheticSurfaceSelected ? null : scene?.id ?? null;
    if (!isSyntheticSurfaceSelected && previewSceneId === null) {
      engine.setEngineMessage(labels.app.currentSceneMissing);
      return;
    }
    if (!(await prepareCurrentEdits())) {
      return;
    }

    const latestProject = await engine.getProjectSnapshot();
    const started = latestProject
      ? isSyntheticSurfaceSelected
        ? gamePreview.startWhole(latestProject)
        : previewSceneId !== null &&
          gamePreview.start(latestProject, previewSceneId)
      : false;
    if (!started) {
      engine.setEngineMessage(
        isSyntheticSurfaceSelected
          ? labels.app.entrySceneMissing
          : labels.app.currentSceneMissing,
      );
    }
  };

  const handleImportImage = async (): Promise<void> => {
    // 未保存项目也能导入：Main 会为当前窗口建立私有临时工作区，
    // 首次保存时再安全发布 manifest 与 assets。Renderer 始终不接触路径。
    if (!(await prepareResourceWorkspaceOperation())) {
      return;
    }

    await engine.importImage();
  };

  const handleImportVideo = async (): Promise<void> => {
    if (!(await prepareResourceWorkspaceOperation())) {
      return;
    }

    await engine.importVideo();
  };

  const handleImportAudio = async (): Promise<void> => {
    if (!(await prepareResourceWorkspaceOperation())) {
      return;
    }

    await engine.importAudio();
  };

  const handleRenameAsset = async (
    assetId: string,
    displayName: string,
  ): Promise<boolean> => {
    if (!(await prepareResourceWorkspaceMutation())) {
      return false;
    }
    return engine.renameAsset(assetId, displayName);
  };

  const handleDeleteAssets = async (assetIds: string[]): Promise<boolean> => {
    if (!(await prepareResourceWorkspaceMutation())) {
      return false;
    }
    return engine.deleteAssets(assetIds);
  };

  const handleSelectBackground = async (
    next: { assetId: string | null; scalePercent: number },
  ): Promise<void> => {
    if (!project || !scene) {
      return;
    }

    if (isCgGallerySelected) {
      // CG images are assigned to explicit page slots in the CG editor.
      // The independent asset workspace only manages and previews resources;
      // assigning a CG still happens through an explicit gallery slot.
      return;
    }

    if (isStartScreenSelected) {
      await updateStartScreenFromLatest(
        { backgroundAssetId: next.assetId },
        prepareCurrentEditsForLeave,
        engine.getProjectSnapshot,
        engine.updateStartScreen,
      );
      return;
    }

    const currentDraft = sceneBackgroundScaleDraftRef.current;
    const draftBelongsToScene = Boolean(
      currentDraft?.projectId === project.id &&
        currentDraft.sceneId === scene.id,
    );
    const rawDraftValue = draftBelongsToScene && currentDraft
      ? currentDraft.value
      : String(next.scalePercent);
    const draftScalePercent = parseImageScaleDraft(rawDraftValue);
    const scalePercent = next.assetId === null
      ? DEFAULT_IMAGE_SCALE_PERCENT
      : draftScalePercent;
    if (
      scene.backgroundAssetId === next.assetId &&
      scene.backgroundScalePercent === scalePercent &&
      !sceneBackgroundScaleDraftDirty
    ) {
      return;
    }

    // 背景命令也会返回完整 C++ 快照。先提交当前编辑器草稿，避免
    // 快照重绘 Blockly 或表单时覆盖尚未写入 C++ 的文字。
    // 初始背景缩放草稿不在这里单独提交；它和新资源共用
    // 同一次 setSceneBackground，避免中间快照把缩放写到旧资源。
    if (
      !(await prepareEditorEditsForLeave()) ||
      (draftBelongsToScene && draftScalePercent === null) ||
      scalePercent === null
    ) {
      return;
    }

    const saved = await engine.setSceneBackground(
      scene.id,
      next.assetId,
      scalePercent,
    );
    if (saved && draftBelongsToScene) {
      clearCommittedSceneBackgroundScaleDraft(
        { projectId: project.id, sceneId: scene.id },
        rawDraftValue,
      );
    }
  };

  const handleSceneChange = async (nextSceneId: string): Promise<void> => {
    if (!project || engine.isBusy) {
      return;
    }

    if (
      nextSceneId === START_SCREEN_SCENE_ID ||
      nextSceneId === CG_GALLERY_SCENE_ID
    ) {
      const selectingStartScreen = nextSceneId === START_SCREEN_SCENE_ID;
      if (
        (selectingStartScreen && isStartScreenSelected) ||
        (!selectingStartScreen && isCgGallerySelected)
      ) {
        return;
      }
      if (await prepareCurrentEditsForLeave()) {
        dispatchEditorSurface({
          type: selectingStartScreen
            ? 'select-start-screen'
            : 'select-cg-gallery',
        });
      }
      return;
    }

    if (
      !project.scenes.some((projectScene) => projectScene.id === nextSceneId)
    ) {
      return;
    }

    if (!(await prepareCurrentEditsForLeave())) {
      return;
    }
    await editor.selectScene(nextSceneId);
    dispatchEditorSurface({ type: 'select-story' });
  };

  const handleAddScene = async (): Promise<void> => {
    if (engine.isBusy || !(await prepareCurrentEditsForLeave())) {
      return;
    }
    await editor.addScene();
  };

  const handleEditorModeChange = async (
    nextMode: EditorMode,
  ): Promise<void> => {
    if (
      nextMode === editorMode ||
      workspaceSection !== 'dialogue' ||
      engine.isBusy
    ) {
      return;
    }

    // 有效草稿先提交给 C++；Code 语法错误或冲突草稿按场景
    // 保留在窗口内存，因此可以安全离开而不会污染其他视图。
    if (await prepareCurrentEditsForLeave()) {
      setEditorMode(nextMode);
    }
  };

  const handleWorkspaceSectionChange = async (
    nextSection: WorkspaceSection,
  ): Promise<void> => {
    if (nextSection === workspaceSection || engine.isBusy) {
      return;
    }

    // 工作区切换与 Form / Blockly / Code 之间的切换共用
    // 同一个宽松边界：有效修改先提交，无效 Code 仅保留在窗口
    // 内存草稿中，因此不会把用户锁在剧情工作区。
    const prepared = await prepareResourceWorkspaceOperation();
    if (prepared) {
      setWorkspaceSection(nextSection);
    }
  };

  latestActionsRef.current = gamePreview.session
    ? {
        create: async () => {},
        open: async () => {},
        save: async () => {},
      }
    : {
        create: handleCreateProject,
        open: handleOpenProject,
        save: handleSaveProject,
      };

  useEffect(() => {
    return subscribeEditorProjectFileCommands((command) => {
      if (command === 'new') {
        void latestActionsRef.current.create();
      } else if (command === 'open') {
        void latestActionsRef.current.open();
      } else {
        void latestActionsRef.current.save();
      }
    });
  }, []);

  useEffect(() => {
    if (!project) {
      return;
    }

    // 打开另一个项目时终止旧名称编辑；普通 C++ 快照刷新则只在未编辑时
    // 同步规范化后的项目名，避免覆盖用户正在输入的草稿。
    setIsRenamingProject(false);
    setProjectNameDraft(project.name);
    setWorkspaceSection('dialogue');
    dispatchEditorSurface({ type: 'project-loaded' });
  }, [project?.id]);

  useEffect(() => {
    if (project && !isRenamingProject) {
      setProjectNameDraft(project.name);
    }
  }, [isRenamingProject, project?.name]);

  useEffect(() => {
    if (!project) {
      return;
    }
    document.title = projectWindowTitle(
      project.name,
      engine.session.hasStorage,
      isDirty,
      labels.app.unsavedWindowTitle,
    );
  }, [engine.session.hasStorage, isDirty, labels, project]);

  if (!project || !scene) {
    return (
      <main className="engine-startup" role="status">
        <strong>Scratch Novel Engine</strong>
        <p>
          {editor.engineMessage || labels.app.starting}
        </p>
        {editor.engineMessage && (
          <button type="button" onClick={() => window.location.reload()}>
            {labels.app.reconnect}
          </button>
        )}
      </main>
    );
  }

  const codeDraftKey = isStartScreenSelected
    ? `${codeDraftSessionRef.current}:${project.id}:start-screen`
    : isCgGallerySelected
      ? `${codeDraftSessionRef.current}:${project.id}:cg-gallery`
      : `${codeDraftSessionRef.current}:${project.id}:story:${scene.id}`;
  const persistedCodeDraft = codeDraftsRef.current.get(codeDraftKey) ?? null;

  const previewScene = projectScaleDraftsOntoPreviewScene(
    scene,
    parseImageScaleDraft(sceneBackgroundScaleDraftValue),
    editor.selectedNodeId,
    typeof editor.selectedImageScaleDraft === 'string'
      ? parseImageScaleDraft(editor.selectedImageScaleDraft)
      : null,
  );
  const timelinePreview = deriveTimelinePreview(
    previewScene,
    editor.selectedNodeId,
  );
  const backgroundAsset = timelinePreview.backgroundAssetId
    ? engine.assets.find(
        (asset) => asset.id === timelinePreview.backgroundAssetId,
      ) ?? null
    : null;
  const backgroundUrl = backgroundAsset
    ? assetPreviewUrls[backgroundAsset.id] ?? null
    : null;
  const cgAsset = timelinePreview.cgAssetId
    ? engine.assets.find(
        (asset) =>
          asset.id === timelinePreview.cgAssetId && asset.type === 'image',
      ) ?? null
    : null;
  const cgUrl = cgAsset
    ? assetPreviewUrls[cgAsset.id] ?? null
    : null;
  const cgName = timelinePreview.cgAssetId === null
    ? null
    : (cgAsset?.displayName ?? labels.common.missingImage);
  const previewCharacters = timelinePreview.characters.map((character) => {
    const asset = engine.assets.find(
      (item) => item.id === character.assetId,
    );
    return {
      id: character.nodeId,
      url: assetPreviewUrls[character.assetId] ?? null,
      name: asset?.displayName ?? labels.app.missingPortrait,
      slot: character.slot,
      layer: character.layer,
      position: character.position,
      scalePercent: character.scalePercent,
      opacity: character.opacity,
      effect: null,
      effectSequence: character.effectSequence,
    };
  });

  return (
    <div
      className="editor"
      data-editor-language={settings.language}
    >
      <Toolbar
        projectName={project.name}
        projectNameDraft={projectNameDraft}
        isRenamingProject={isRenamingProject}
        editorMode={editorMode}
        workspaceSection={workspaceSection}
        isBusy={editor.isBusy}
        isDirty={isDirty}
        isSaving={engine.isSaving}
        isExporting={engine.isExporting}
        engineMessage={editor.engineMessage}
        operationMessage={engine.exportMessage}
        projectFolderName={engine.projectFolderName}
        language={settings.language}
        isSettingsSaving={isSettingsSaving}
        settingsSaveFailed={settingsSaveFailed}
        settingsRestartRequired={settingsRestartRequired}
        onCreateProject={() => void handleCreateProject()}
        onOpenProject={() => void handleOpenProject()}
        onSaveProject={() => void handleSaveProject()}
        onExportGame={(request) => void handleExportGame(request)}
        onBeginRenameProject={() => {
          setProjectNameDraft(project.name);
          setIsRenamingProject(true);
        }}
        onProjectNameDraftChange={setProjectNameDraft}
        onCommitProjectName={commitProjectName}
        onCancelProjectName={() => {
          setProjectNameDraft(project.name);
          setIsRenamingProject(false);
        }}
        onWorkspaceSectionChange={(section) => {
          void handleWorkspaceSectionChange(section);
        }}
        onEditorModeChange={(mode) => {
          void handleEditorModeChange(mode);
        }}
        onLanguageChange={onLanguageChange}
        onOpenSettings={onOpenSettings}
      />

      {workspaceSection === 'resources' ? (
        <AssetManager
          project={project}
          assets={engine.assets}
          previewUrls={assetPreviewUrls}
          isBusy={engine.isBusy}
          isProjectNameEditing={isRenamingProject}
          projectGeneration={engine.projectGeneration}
          onImportImage={handleImportImage}
          onImportAudio={handleImportAudio}
          onImportVideo={handleImportVideo}
          onRenameAsset={handleRenameAsset}
          onDeleteAssets={handleDeleteAssets}
        />
      ) : editorMode === 'code' ? (
        <CodeEditor
          ref={codeEditorRef}
          project={project}
          target={isStartScreenSelected
            ? { kind: 'start-screen' }
            : isCgGallerySelected
              ? { kind: 'cg-gallery' }
              : { kind: 'story', scene }}
          assets={engine.assets}
          isBusy={engine.isBusy}
          onSceneChange={handleSceneChange}
          onSelectStartScreen={() =>
            handleSceneChange(START_SCREEN_SCENE_ID)
          }
          onSelectCgGallery={() =>
            handleSceneChange(CG_GALLERY_SCENE_ID)
          }
          onUpdateStartScreenStyle={engine.updateStartScreenStyle}
          onUpdateCgGalleryStyle={engine.updateCgGalleryStyle}
          onReplaceSceneContent={(sceneId, draft) =>
            engine.replaceSceneContent({ sceneId, draft })
          }
          draftKey={codeDraftKey}
          persistedDraft={persistedCodeDraft}
          onDraftChange={updateCodeDraft}
          onDraftDirtyChange={syncCodeDraftDirty}
          onStartPreview={() => void handleStartPreview()}
        />
      ) : isCgGallerySelected && editorMode === 'form' ? (
        <CgGalleryFormEditor
          ref={cgGalleryEditorRef}
          project={project}
          assets={engine.assets}
          previewUrls={assetPreviewUrls}
          isBusy={engine.isBusy}
          isStartPreviewDisabled={engine.isBusy}
          onSceneChange={handleSceneChange}
          onUpdateCgGallery={engine.updateCgGallery}
          onDraftDirtyChange={setBlockDraftDirty}
          onStartPreview={() => void handleStartPreview()}
        />
      ) : isCgGallerySelected ? (
        <CgGalleryEditor
          ref={cgGalleryEditorRef}
          project={project}
          assets={engine.assets}
          isBusy={engine.isBusy}
          isStartPreviewDisabled={engine.isBusy}
          onSceneChange={handleSceneChange}
          onUpdateCgGallery={engine.updateCgGallery}
          onDraftDirtyChange={setBlockDraftDirty}
          onStartPreview={() => void handleStartPreview()}
        />
      ) : isStartScreenSelected && editorMode === 'form' ? (
        <StartScreenFormEditor
          ref={startScreenEditorRef}
          project={project}
          assets={engine.assets}
          backgroundUrl={
            project.startScreen.backgroundAssetId === null
              ? null
              : assetPreviewUrls[
                  project.startScreen.backgroundAssetId
                ] ?? null
          }
          isBusy={engine.isBusy}
          isStartPreviewDisabled={engine.isBusy}
          onSceneChange={handleSceneChange}
          onUpdateStartScreen={engine.updateStartScreen}
          onDraftDirtyChange={setBlockDraftDirty}
          onStartPreview={() => void handleStartPreview()}
        />
      ) : isStartScreenSelected ? (
        <StartScreenEditor
          ref={startScreenEditorRef}
          project={project}
          assets={engine.assets}
          isBusy={engine.isBusy}
          isStartPreviewDisabled={engine.isBusy}
          onSceneChange={handleSceneChange}
          onUpdateStartScreen={engine.updateStartScreen}
          onDraftDirtyChange={setBlockDraftDirty}
          onStartPreview={() => void handleStartPreview()}
        />
      ) : editorMode === 'form' ? (
        <FormEditor
          editor={editor}
          assets={engine.assets}
          backgroundAssetId={scene.backgroundAssetId}
          sceneBackgroundScalePercent={scene.backgroundScalePercent}
          sceneBackgroundScaleDraft={sceneBackgroundScaleDraftValue}
          sceneBackgroundScaleDraftInvalid={sceneBackgroundScaleDraftInvalid}
          onSceneBackgroundScaleDraftChange={setSceneBackgroundScaleDraft}
          onCommitSceneBackgroundScaleDraft={commitSceneBackgroundScaleDraft}
          onSelectSceneBackground={handleSelectBackground}
          backgroundUrl={backgroundUrl}
          backgroundName={backgroundAsset?.displayName ?? null}
          backgroundScalePercent={timelinePreview.backgroundScalePercent}
          cgUrl={cgUrl}
          cgName={cgName}
          showDialogue={timelinePreview.showDialogue}
          logicPreviewUncertain={
            timelinePreview.logicPreviewUncertain === true
          }
          cgPreviewUncertain={
            timelinePreview.cgPreviewUncertain === true
          }
          characters={previewCharacters}
          isStartPreviewDisabled={engine.isBusy}
          onStartPreview={() => void handleStartPreview()}
          onAddScene={handleAddScene}
          onSelectScene={handleSceneChange}
          onSelectStartScreen={() =>
            handleSceneChange(START_SCREEN_SCENE_ID)
          }
          onSelectCgGallery={() =>
            handleSceneChange(CG_GALLERY_SCENE_ID)
          }
        />
      ) : (
        <BlockEditor
          ref={blockEditorRef}
          project={project}
          scene={scene}
          assets={engine.assets}
          backgroundAssetId={scene.backgroundAssetId}
          sceneBackgroundScalePercent={scene.backgroundScalePercent}
          sceneBackgroundScaleDraft={sceneBackgroundScaleDraftValue}
          sceneBackgroundScaleDraftInvalid={sceneBackgroundScaleDraftInvalid}
          onSceneBackgroundScaleDraftChange={setSceneBackgroundScaleDraft}
          onCommitSceneBackgroundScaleDraft={commitSceneBackgroundScaleDraft}
          onSelectSceneBackground={handleSelectBackground}
          layoutStore={blockEditorLayouts.current}
          isBusy={engine.isBusy}
          onSceneChange={handleSceneChange}
          onSelectStartScreen={() =>
            handleSceneChange(START_SCREEN_SCENE_ID)
          }
          onSelectCgGallery={() =>
            handleSceneChange(CG_GALLERY_SCENE_ID)
          }
          onDialogueUpdate={engine.updateDialogue}
          onDialogueAdd={engine.addDialogue}
          onBackgroundAdd={engine.addBackground}
          onBackgroundUpdate={engine.updateBackground}
          onCharacterAdd={engine.addCharacter}
          onCharacterUpdate={engine.updateCharacter}
          onCharacterEffectUpdate={engine.updateCharacterEffect}
          onCharacterEffectMove={engine.moveCharacterEffect}
          onSceneJumpAdd={engine.addSceneJump}
          onSceneJumpUpdate={engine.updateSceneJump}
          onBgmAdd={engine.addBgm}
          onBgmUpdate={engine.updateBgm}
          onVideoAdd={engine.addVideo}
          onVideoUpdate={engine.updateVideo}
          onChoiceAdd={engine.addChoice}
          onChoiceOptionAdd={engine.addChoiceOption}
          onStoryExtensionAdd={engine.addStoryExtension}
          onVariableSetAdd={engine.addVariableSet}
          onVariableSetUpdate={engine.updateVariableSet}
          onVariableChangeAdd={engine.addVariableChange}
          onVariableChangeUpdate={engine.updateVariableChange}
          onLogicIfAdd={engine.addLogicIf}
          onLogicIfUpdate={engine.updateLogicIf}
          onLogicRepeatAdd={engine.addLogicRepeat}
          onLogicRepeatUpdate={engine.updateLogicRepeat}
          onLogicControlDelete={engine.deleteLogicControl}
          onLogicControlReorder={engine.reorderLogicControl}
          onCgDisplayAdd={engine.addCgDisplay}
          onCgDisplayUpdate={engine.updateCgDisplay}
          onCgDisplayDelete={engine.deleteCgDisplay}
          onCgDisplayReorder={engine.reorderCgDisplay}
          onChoiceOptionUpdate={engine.updateChoiceOption}
          onChoiceOptionDelete={engine.deleteChoiceOption}
          onChoiceOptionReorder={engine.reorderChoiceOption}
          onDialogueVoiceUpdate={engine.setDialogueVoice}
          onTimelineReorder={engine.reorderTimelineNode}
          onTimelineNodesReorder={engine.reorderTimelineNodes}
          onTimelineNodesDelete={engine.deleteTimelineNodes}
          onDraftDirtyChange={setBlockDraftDirty}
        />
      )}

      <ErrorDialog
        open={Boolean(editor.engineMessage)}
        title={labels.common.error}
        message={editor.engineMessage}
        onConfirm={() => engine.setEngineMessage('')}
      />

      <CreateProjectDialog
        open={isCreateProjectOpen}
        projectName={newProjectName}
        isBusy={engine.isBusy}
        onProjectNameChange={setNewProjectName}
        onCancel={() => setIsCreateProjectOpen(false)}
        onConfirm={() => void confirmCreateProject()}
      />

      {gamePreview.session ? (
        <GamePreview
          session={gamePreview.session}
          assets={engine.assets}
          previewUrls={assetPreviewUrls}
          resolveMediaUrl={resolveEditorMediaUrl}
          onAdvance={gamePreview.advance}
          onCgLeadInComplete={gamePreview.completeCgLeadIn}
          onVideoComplete={gamePreview.completeVideo}
          onChoiceSelect={gamePreview.selectChoice}
          onEnterStory={gamePreview.enterStory}
          onExit={gamePreview.exit}
        />
      ) : null}
    </div>
  );
}

export default function App() {
  const editorSettings = useEditorSettings();
  const { settings } = editorSettings;

  useEffect(() => {
    if (settings === null) {
      return;
    }
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = settings.language;
    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [settings?.language]);

  if (settings === null) {
    return (
      <main className="engine-startup" role="status" aria-busy="true">
        <strong>Scratch Novel Engine</strong>
        <span className="editor-settings-bootstrap-indicator" aria-hidden="true" />
      </main>
    );
  }

  return (
    <EditorI18nProvider language={settings.language}>
      <RendererErrorBoundary language={settings.language}>
        <EditorApplication
          settings={settings}
          isSettingsSaving={editorSettings.isSaving}
          settingsSaveFailed={editorSettings.saveFailed}
          settingsRestartRequired={editorSettings.restartRequired}
          onLanguageChange={editorSettings.changeLanguage}
          onOpenSettings={editorSettings.dismissSaveError}
        />
      </RendererErrorBoundary>
    </EditorI18nProvider>
  );
}
