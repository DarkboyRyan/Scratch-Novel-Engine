import { useEffect, useRef, useState } from 'react';

import { ErrorDialog } from './components/ErrorDialog';
import { CreateProjectDialog } from './components/CreateProjectDialog';
import { Toolbar, type EditorMode } from './components/Toolbar';
import {
  BlockEditor,
  type BlockEditorHandle,
} from './features/block-editor/BlockEditor';
import type { BlockEditorLayoutStore } from './features/block-editor/blockEditorLayout';
import { ResourcePanel } from './features/assets/ResourcePanel';
import { useAssetPreviewUrls } from './features/assets/useAssetPreviewUrls';
import { FormEditor } from './features/form-editor/FormEditor';
import { useFormEditor } from './features/form-editor/useFormEditor';
import { deriveTimelinePreview } from './features/form-editor/timelinePreview';
import { GamePreview } from './features/game-preview/GamePreview';
import { useGamePreview } from './features/game-preview/useGamePreview';
import { useEngineProject } from './hooks/useEngineProject';
import { prepareProjectSave } from './projectSavePreparation';
import { projectWindowTitle } from './projectSessionPresentation';

export default function App() {
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const blockEditorLayouts =
    useRef<BlockEditorLayoutStore>(new Map());
  const blockEditorRef = useRef<BlockEditorHandle>(null);
  const engine = useEngineProject();
  const editor = useFormEditor(engine);
  const gamePreview = useGamePreview();
  const { project, scene } = editor;
  const assetPreviewUrls = useAssetPreviewUrls(
    project?.id ?? null,
    engine.projectGeneration,
    engine.assets,
  );
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('未命名项目');
  const [blockDraftDirty, setBlockDraftDirty] = useState(false);
  const projectNameCommitRef = useRef<Promise<boolean> | null>(null);
  const projectNameDraftDirty = Boolean(
    project &&
      isRenamingProject &&
      projectNameDraft !== project.name,
  );
  const isDirty =
    engine.session.isDirty ||
    editor.draftDirty ||
    projectNameDraftDirty ||
    blockDraftDirty;
  const latestActionsRef = useRef({
    create: async () => {},
    open: async () => {},
    save: async () => {},
  });

  const handleCreateProject = async () => {
    setNewProjectName('未命名项目');
    setIsCreateProjectOpen(true);
  };

  const confirmCreateProject = async () => {
    const normalizedName = newProjectName.trim();
    if (!normalizedName) {
      engine.setEngineMessage('项目名不可为空');
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
      !window.confirm('当前项目有未保存内容，仍要打开另一个项目吗？')
    ) {
      return;
    }

    const status = await engine.openProject();
    if (status === 'opened') {
      setIsRenamingProject(false);
      setBlockDraftDirty(false);
      editor.resetEditorState();
      blockEditorLayouts.current.clear();
      setEditorMode('form');
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

  const prepareCurrentEdits = async (): Promise<boolean> => {
    // 先提交当前正在编辑的视图，再提交项目名，最后才写文件。
    // Blockly 必须第一个 flush：项目重命名返回的 C++ 快照会重绘
    // workspace，如果先重命名，可能把仍在输入框中的最新文字覆盖。
    const prepared = await prepareProjectSave({
      editorMode,
      flushBlockDraft: () =>
        blockEditorRef.current?.flushPendingDraft() ??
        Promise.resolve(true),
      commitProjectName,
      commitFormDraft: editor.commitPendingDraft,
    });

    if (prepared && editorMode === 'blocks') {
      setBlockDraftDirty(false);
    }
    return prepared;
  };

  const handleSaveProject = async () => {
    await engine.saveProject(prepareCurrentEdits);
  };

  const handleStartPreview = async (): Promise<void> => {
    if (engine.isBusy || gamePreview.session) {
      return;
    }
    if (!(await prepareCurrentEdits())) {
      return;
    }

    const latestProject = await engine.getProjectSnapshot();
    if (!latestProject || !gamePreview.start(latestProject)) {
      engine.setEngineMessage('项目入口场景不存在，无法开始预览');
    }
  };

  const handleImportImage = async (): Promise<void> => {
    // 未保存项目也能导入：Main 会为当前窗口建立私有临时工作区，
    // 首次保存时再安全发布 manifest 与 assets。Renderer 始终不接触路径。
    if (!(await prepareCurrentEdits())) {
      return;
    }

    await engine.importImage();
  };

  const handleImportVideo = async (): Promise<void> => {
    if (!(await prepareCurrentEdits())) {
      return;
    }

    await engine.importVideo();
  };

  const handleSelectBackground = async (
    assetId: string | null,
  ): Promise<void> => {
    if (!scene || scene.backgroundAssetId === assetId) {
      return;
    }

    // 背景命令也会返回完整 C++ 快照。先提交当前编辑器草稿，避免
    // 快照重绘 Blockly 或表单时覆盖尚未写入 C++ 的文字。
    if (!(await prepareCurrentEdits())) {
      return;
    }

    await engine.setSceneBackground(scene.id, assetId);
  };

  const handleEditorModeChange = async (
    nextMode: EditorMode,
  ): Promise<void> => {
    if (nextMode === editorMode || engine.isBusy) {
      return;
    }

    // 切换视图会卸载当前编辑器，所以先把它的草稿提交给
    // C++。提交失败就留在当前模式，避免隐藏或丢失用户输入。
    const committed =
      editorMode === 'form'
        ? await editor.commitPendingDraft()
        : await (blockEditorRef.current?.flushPendingDraft() ?? true);

    if (committed) {
      setEditorMode(nextMode);
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
    return window.vnProjectFiles.onCommand((command) => {
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
    );
  }, [engine.session.hasStorage, isDirty, project]);

  if (!project || !scene) {
    return (
      <main className="engine-startup" role="status">
        <strong>VN Engine Editor</strong>
        <p>
          {editor.engineMessage || '正在启动 C++ 后端并创建项目……'}
        </p>
        {editor.engineMessage && (
          <button type="button" onClick={() => window.location.reload()}>
            重新连接
          </button>
        )}
      </main>
    );
  }

  const timelinePreview = deriveTimelinePreview(
    scene,
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
  const previewCharacters = timelinePreview.characters.map((character) => {
    const asset = engine.assets.find(
      (item) => item.id === character.assetId,
    );
    return {
      id: character.nodeId,
      url: assetPreviewUrls[character.assetId] ?? null,
      name: asset?.displayName ?? '缺失立绘',
      slot: character.slot,
      layer: character.layer,
    };
  });

  return (
    <div className="editor">
      <Toolbar
        projectName={project.name}
        projectNameDraft={projectNameDraft}
        isRenamingProject={isRenamingProject}
        editorMode={editorMode}
        isBusy={editor.isBusy}
        isDirty={isDirty}
        isSaving={engine.isSaving}
        engineMessage={editor.engineMessage}
        projectFolderName={engine.projectFolderName}
        onCreateProject={() => void handleCreateProject()}
        onOpenProject={() => void handleOpenProject()}
        onSaveProject={() => void handleSaveProject()}
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
        onEditorModeChange={(mode) => {
          void handleEditorModeChange(mode);
        }}
      />

      <ResourcePanel
        assets={engine.assets}
        backgroundAssetId={scene.backgroundAssetId}
        previewUrls={assetPreviewUrls}
        isBusy={engine.isBusy}
        onImportImage={handleImportImage}
        onImportVideo={handleImportVideo}
        onSelectBackground={handleSelectBackground}
      />

      {editorMode === 'form' ? (
        <FormEditor
          editor={editor}
          assets={engine.assets}
          backgroundUrl={backgroundUrl}
          backgroundName={backgroundAsset?.displayName ?? null}
          showDialogue={timelinePreview.showDialogue}
          characters={previewCharacters}
          isStartPreviewDisabled={engine.isBusy}
          onStartPreview={() => void handleStartPreview()}
        />
      ) : (
        <BlockEditor
          ref={blockEditorRef}
          project={project}
          scene={scene}
          assets={engine.assets}
          layoutStore={blockEditorLayouts.current}
          isBusy={engine.isBusy}
          onSceneChange={editor.selectScene}
          onDialogueUpdate={engine.updateDialogue}
          onDialogueAdd={engine.addDialogue}
          onBackgroundAdd={engine.addBackground}
          onBackgroundUpdate={engine.updateBackground}
          onCharacterAdd={engine.addCharacter}
          onCharacterUpdate={engine.updateCharacter}
          onSceneJumpAdd={engine.addSceneJump}
          onSceneJumpUpdate={engine.updateSceneJump}
          onTimelineReorder={engine.reorderTimelineNode}
          onTimelineNodesReorder={engine.reorderTimelineNodes}
          onTimelineNodesDelete={engine.deleteTimelineNodes}
          onDraftDirtyChange={setBlockDraftDirty}
        />
      )}

      <ErrorDialog
        open={Boolean(editor.engineMessage)}
        title="错误"
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
          onAdvance={gamePreview.advance}
          onExit={gamePreview.exit}
        />
      ) : null}
    </div>
  );
}
