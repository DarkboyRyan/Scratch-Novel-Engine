import { useEffect, useRef, useState } from 'react';

import type { ImportAssetResult } from '../../shared/assetProtocol';
import type {
  AddBackgroundParams,
  AddBgmParams,
  AddCharacterParams,
  AddChoiceOptionParams,
  AddChoiceParams,
  AddDialogueParams,
  AddSceneJumpParams,
  AddVideoParams,
  DeleteBackgroundParams,
  DeleteDialoguesParams,
  DeleteChoiceOptionParams,
  EngineMutationResult,
  ReorderBackgroundParams,
  ReorderDialogueParams,
  ReorderDialoguesParams,
  ReorderChoiceOptionParams,
  SetDialogueVoiceParams,
  TimelineDeleteManyParams,
  TimelineReorderManyParams,
  TimelineReorderParams,
  UpdateBackgroundParams,
  UpdateBgmParams,
  UpdateCharacterParams,
  UpdateChoiceOptionParams,
  UpdateSceneJumpParams,
  UpdateVideoParams,
} from '../../shared/engineProtocol';
import type {
  AssetDocument,
  ProjectDocument,
} from '../../shared/projectTypes';
import type { ProjectFileSessionSnapshot } from '../../shared/projectFileProtocol';
import { EMPTY_DIALOGUE_MESSAGE } from '../editorMessages';

export type AddDialogueAction = (
  params: AddDialogueParams,
) => Promise<boolean>;

export type UpdateDialogueAction = (
  sceneId: string,
  nodeId: string,
  speaker: string,
  text: string,
) => Promise<boolean>;

export type SetDialogueVoiceAction = (
  params: SetDialogueVoiceParams,
) => Promise<boolean>;

export type ReorderDialogueAction = (
  params: ReorderDialogueParams,
) => Promise<boolean>;

export type ReorderDialoguesAction = (
  params: ReorderDialoguesParams,
) => Promise<boolean>;

export type DeleteDialoguesAction = (
  params: DeleteDialoguesParams,
) => Promise<boolean>;

export type AddBackgroundAction = (
  params: AddBackgroundParams,
) => Promise<boolean>;

export type UpdateBackgroundAction = (
  params: UpdateBackgroundParams,
) => Promise<boolean>;

export type AddCharacterAction = (
  params: AddCharacterParams,
) => Promise<boolean>;

export type UpdateCharacterAction = (
  params: UpdateCharacterParams,
) => Promise<boolean>;

export type AddSceneJumpAction = (
  params: AddSceneJumpParams,
) => Promise<boolean>;

export type UpdateSceneJumpAction = (
  params: UpdateSceneJumpParams,
) => Promise<boolean>;

export type AddBgmAction = (
  params: AddBgmParams,
) => Promise<boolean>;

export type UpdateBgmAction = (
  params: UpdateBgmParams,
) => Promise<boolean>;

export type AddVideoAction = (
  params: AddVideoParams,
) => Promise<boolean>;

export type UpdateVideoAction = (
  params: UpdateVideoParams,
) => Promise<boolean>;

export type AddChoiceAction = (
  params: AddChoiceParams,
) => Promise<boolean>;

export type AddChoiceOptionAction = (
  params: AddChoiceOptionParams,
) => Promise<boolean>;

export type UpdateChoiceOptionAction = (
  params: UpdateChoiceOptionParams,
) => Promise<boolean>;

export type DeleteChoiceOptionAction = (
  params: DeleteChoiceOptionParams,
) => Promise<boolean>;

export type ReorderChoiceOptionAction = (
  params: ReorderChoiceOptionParams,
) => Promise<boolean>;

export type DeleteBackgroundAction = (
  params: DeleteBackgroundParams,
) => Promise<boolean>;

export type ReorderBackgroundAction = (
  params: ReorderBackgroundParams,
) => Promise<boolean>;

export type DeleteTimelineNodesAction = (
  params: TimelineDeleteManyParams,
) => Promise<boolean>;

export type ReorderTimelineNodeAction = (
  params: TimelineReorderParams,
) => Promise<boolean>;

export type ReorderTimelineNodesAction = (
  params: TimelineReorderManyParams,
) => Promise<boolean>;

export type OpenProjectStatus =
  | 'opened'
  | 'cancelled'
  | 'failed';

export type ImportAssetStatus = ImportAssetResult['status'] | 'failed';
export type ImportImageStatus = ImportAssetStatus;

function requestInitialProject(): Promise<EngineMutationResult> {
  // 每个 BrowserWindow 都拥有独立后端；不可使用模块级 Promise，否则开发
  // StrictMode 或同一 Renderer 进程中的另一窗口可能读到错误项目。
  return window.vnEngine.ensureProject();
}

function readableError(error: unknown): string {
  if (
    error instanceof Error &&
    (error.message.includes('addSceneJump is not a function') ||
      error.message.includes('updateSceneJump is not a function') ||
      error.message.includes('unknown method: sceneJump'))
  ) {
    return '场景跳转模块尚未加载，请完全退出并重新启动编辑器';
  }

  if (
    error instanceof Error &&
    error.message.includes('dialogue text must not be empty')
  ) {
    return EMPTY_DIALOGUE_MESSAGE;
  }

  if (
    error instanceof Error &&
    error.message.includes('project name must not be empty')
  ) {
    return '项目名不可为空';
  }

  if (
    error instanceof Error &&
    error.message.includes('project file could not be saved safely')
  ) {
    return '项目保存失败，请检查文件夹权限或磁盘剩余空间';
  }

  return error instanceof Error
    ? error.message
    : 'C++ 后端发生了未知错误';
}

// 这一层只协调“Project 快照 ↔ C++ API”，不知道当前选中了哪个节点。
export function useEngineProject() {
  const [project, setProject] =
    useState<ProjectDocument | null>(null);
  const [assets, setAssets] = useState<AssetDocument[]>([]);
  // 即使重新打开的是同一个 project.id，Main 也会轮换图片预览能力令牌。
  // 这个计数让 Renderer 丢弃旧 URL，并按新项目会话重新申请。
  const [projectGeneration, setProjectGeneration] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pendingEngineActions, setPendingEngineActions] = useState(0);
  const [isFileOperating, setIsFileOperating] = useState(false);
  const [engineMessage, setEngineMessage] = useState('');
  const [session, setSession] = useState<ProjectFileSessionSnapshot>({
    hasStorage: false,
    projectFolderName: null,
    revision: 0,
    savedRevision: null,
    isDirty: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const fileOperationInProgress = useRef(false);
  const engineActionQueue = useRef<Promise<void>>(Promise.resolve());
  const initializationRequest = useRef<Promise<[
    EngineMutationResult,
    ProjectFileSessionSnapshot,
  ]> | null>(null);
  const isBusy =
    isInitializing ||
    pendingEngineActions > 0 ||
    isFileOperating ||
    isSaving;

  function applyResult(
    result: EngineMutationResult,
    fileSession?: ProjectFileSessionSnapshot,
  ): void {
    setProject(result.project);
    setAssets(result.assets);

    if (fileSession) {
      setSession({
        ...fileSession,
        ...result.session,
      });
      return;
    }

    setSession((current) => ({
      ...current,
      ...result.session,
    }));
  }

  useEffect(() => {
    let isActive = true;

    initializationRequest.current ??= Promise.all([
      requestInitialProject(),
      window.vnProjectFiles.getSession(),
    ]);

    void initializationRequest.current
      .then(([result, session]) => {
        if (isActive) {
          applyResult(result, {
            ...session,
            revision: result.session.revision,
            savedRevision: result.session.savedRevision,
            isDirty: result.session.isDirty,
          });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setEngineMessage(readableError(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsInitializing(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function runEngineAction(
    action: () => Promise<EngineMutationResult>,
  ): Promise<EngineMutationResult | null> {
    let resolveQueuedResult: (
      result: EngineMutationResult | null,
    ) => void = () => {};
    const queuedResult = new Promise<EngineMutationResult | null>(
      (resolve) => {
        resolveQueuedResult = resolve;
      },
    );

    // 在命令进入队列时就计数，而不是等它真正开始执行。这样 UI 在前一条
    // 命令尚未结束时也不会短暂恢复为可编辑状态。
    setPendingEngineActions((current) => current + 1);
    engineActionQueue.current = engineActionQueue.current.then(async () => {
      setEngineMessage('');

      try {
        const result = await action();
        applyResult(result);
        resolveQueuedResult(result);
      } catch (error: unknown) {
        setEngineMessage(readableError(error));
        resolveQueuedResult(null);
      } finally {
        setPendingEngineActions((current) => Math.max(0, current - 1));
      }
    });

    return queuedResult;
  }

  async function waitForEngineActions(): Promise<void> {
    await engineActionQueue.current;
  }

  async function getProjectSnapshot(): Promise<ProjectDocument | null> {
    const result = await runEngineAction(() => window.vnEngine.getProject());
    return result?.project ?? null;
  }

  async function addDialogue(
    params: AddDialogueParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addDialogue(params),
    );

    return result !== null;
  }

  async function updateDialogue(
    sceneId: string,
    nodeId: string,
    speaker: string,
    text: string,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.updateDialogue(
        sceneId,
        nodeId,
        speaker,
        text,
      ),
    );

    return result !== null;
  }

  async function setDialogueVoice(
    params: SetDialogueVoiceParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.setDialogueVoice(params),
    );
    return result !== null;
  }

  async function reorderDialogue(
    params: ReorderDialogueParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.reorderDialogue(params),
    );

    return result !== null;
  }

  async function reorderDialogues(
    params: ReorderDialoguesParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.reorderDialogues(params),
    );

    return result !== null;
  }

  async function deleteDialogues(
    params: DeleteDialoguesParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.deleteDialogues(params),
    );

    return result !== null;
  }

  async function addBackground(
    params: AddBackgroundParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addBackground(params),
    );

    return result !== null;
  }

  async function updateBackground(
    params: UpdateBackgroundParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.updateBackground(params),
    );

    return result !== null;
  }

  async function deleteBackground(
    params: DeleteBackgroundParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.deleteBackground(params),
    );

    return result !== null;
  }

  async function reorderBackground(
    params: ReorderBackgroundParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.reorderBackground(params),
    );

    return result !== null;
  }

  async function addCharacter(
    params: AddCharacterParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addCharacter(params),
    );

    return result !== null;
  }

  async function updateCharacter(
    params: UpdateCharacterParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.updateCharacter(params),
    );

    return result !== null;
  }

  async function addSceneJump(
    params: AddSceneJumpParams,
  ): Promise<boolean> {
    if (typeof window.vnEngine.addSceneJump !== 'function') {
      setEngineMessage('场景跳转模块尚未加载，请完全退出并重新启动编辑器');
      return false;
    }
    const result = await runEngineAction(() =>
      window.vnEngine.addSceneJump(params),
    );
    return result !== null;
  }

  async function updateSceneJump(
    params: UpdateSceneJumpParams,
  ): Promise<boolean> {
    if (typeof window.vnEngine.updateSceneJump !== 'function') {
      setEngineMessage('场景跳转模块尚未加载，请完全退出并重新启动编辑器');
      return false;
    }
    const result = await runEngineAction(() =>
      window.vnEngine.updateSceneJump(params),
    );
    return result !== null;
  }

  async function addBgm(
    params: AddBgmParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addBgm(params),
    );
    return result !== null;
  }

  async function updateBgm(
    params: UpdateBgmParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.updateBgm(params),
    );
    return result !== null;
  }

  async function addVideo(
    params: AddVideoParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addVideo(params),
    );
    return result !== null;
  }

  async function updateVideo(
    params: UpdateVideoParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.updateVideo(params),
    );
    return result !== null;
  }

  async function addChoice(
    params: AddChoiceParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addChoice(params),
    );
    return result !== null;
  }

  async function addChoiceOption(
    params: AddChoiceOptionParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addChoiceOption(params),
    );
    return result !== null;
  }

  async function updateChoiceOption(
    params: UpdateChoiceOptionParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.updateChoiceOption(params),
    );
    return result !== null;
  }

  async function deleteChoiceOption(
    params: DeleteChoiceOptionParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.deleteChoiceOption(params),
    );
    return result !== null;
  }

  async function reorderChoiceOption(
    params: ReorderChoiceOptionParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.reorderChoiceOption(params),
    );
    return result !== null;
  }

  async function deleteTimelineNodes(
    params: TimelineDeleteManyParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.deleteTimelineNodes(params),
    );

    return result !== null;
  }

  async function reorderTimelineNode(
    params: TimelineReorderParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.reorderTimelineNode(params),
    );

    return result !== null;
  }

  async function reorderTimelineNodes(
    params: TimelineReorderManyParams,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.reorderTimelineNodes(params),
    );

    return result !== null;
  }

  async function createProject(name?: string): Promise<boolean> {
    if (fileOperationInProgress.current) {
      return false;
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');

    try {
      await window.vnProjectFiles.createProject(name);
      return true;
    } catch (error: unknown) {
      setEngineMessage(readableError(error));
      return false;
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function openProject(): Promise<OpenProjectStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');

    try {
      await waitForEngineActions();
      const outcome = await window.vnProjectFiles.openProject();

      if (outcome.cancelled) {
        return 'cancelled';
      }

      // Main 只会在 C++ 已完整解析并校验项目后返回成功。
      applyResult(outcome.result, outcome.session);
      setProjectGeneration((current) => current + 1);
      return 'opened';
    } catch (error: unknown) {
      // 失败时不调用 setProject，因此当前编辑内容会原样保留。
      setEngineMessage(readableError(error));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function saveProject(
    prepare?: () => Promise<boolean>,
  ): Promise<boolean> {
    if (fileOperationInProgress.current) {
      return false;
    }

    fileOperationInProgress.current = true;
    setIsSaving(true);
    setEngineMessage('');

    try {
      if (prepare && !(await prepare())) {
        return false;
      }
      await waitForEngineActions();
      const outcome = await window.vnProjectFiles.saveProject();

      if (outcome.cancelled) {
        setSession(outcome.session);
        return false;
      }

      applyResult(outcome.result, outcome.session);
      // Main 会在每次成功保存后刷新私有资源清单。即使 project/assets
      // 业务数据没变，也重新申请一次预览 URL，以便从先前的安全降级
      // （例如临时读取失败）中恢复。
      setProjectGeneration((current) => current + 1);
      return true;
    } catch (error: unknown) {
      setEngineMessage(readableError(error));
      return false;
    } finally {
      fileOperationInProgress.current = false;
      setIsSaving(false);
    }
  }

  async function renameProject(name: string): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.renameProject(name),
    );
    return result !== null;
  }

  async function setSceneBackground(
    sceneId: string,
    assetId: string | null,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.setSceneBackground(sceneId, assetId),
    );
    return result !== null;
  }

  async function importImage(): Promise<ImportImageStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');

    try {
      await waitForEngineActions();
      const outcome = await window.vnAssets.importImage();

      if (outcome.status === 'cancelled') {
        return outcome.status;
      }

      applyResult(outcome.result);
      return outcome.status;
    } catch (error: unknown) {
      setEngineMessage(readableError(error));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function importVideo(): Promise<ImportAssetStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');

    try {
      await waitForEngineActions();
      const outcome = await window.vnAssets.importVideo();

      if (outcome.status === 'cancelled') {
        return outcome.status;
      }

      applyResult(outcome.result);
      return outcome.status;
    } catch (error: unknown) {
      setEngineMessage(readableError(error));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function importAudio(): Promise<ImportAssetStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');

    try {
      await waitForEngineActions();
      const outcome = await window.vnAssets.importAudio();

      if (outcome.status === 'cancelled') {
        return outcome.status;
      }

      applyResult(outcome.result);
      return outcome.status;
    } catch (error: unknown) {
      setEngineMessage(readableError(error));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  return {
    project,
    assets,
    projectGeneration,
    projectFolderName: session.projectFolderName,
    session,
    isSaving,
    isBusy,
    engineMessage,
    setEngineMessage,
    runEngineAction,
    addDialogue,
    updateDialogue,
    setDialogueVoice,
    reorderDialogue,
    reorderDialogues,
    deleteDialogues,
    addBackground,
    updateBackground,
    deleteBackground,
    reorderBackground,
    addCharacter,
    updateCharacter,
    addSceneJump,
    updateSceneJump,
    addBgm,
    updateBgm,
    addVideo,
    updateVideo,
    addChoice,
    addChoiceOption,
    updateChoiceOption,
    deleteChoiceOption,
    reorderChoiceOption,
    deleteTimelineNodes,
    reorderTimelineNode,
    reorderTimelineNodes,
    createProject,
    openProject,
    saveProject,
    importImage,
    importVideo,
    importAudio,
    renameProject,
    setSceneBackground,
    waitForEngineActions,
    getProjectSnapshot,
  };
}

export type EngineProjectState = ReturnType<typeof useEngineProject>;
