import { useEffect, useRef, useState } from 'react';

import type { ImportAssetResult } from '../../shared/assetProtocol';
import type { EngineMutationResult } from '../../shared/engineProtocol';
import type {
  ExportGameCompletedResult,
  GameExportRequest,
} from '../../shared/exportProtocol';
import type {
  AssetDocument,
  ProjectDocument,
} from '../../shared/projectTypes';
import type { ProjectFileSessionSnapshot } from '../../shared/projectFileProtocol';
import { createAuthoringActions } from '../application/createAuthoringActions';
import {
  getEditorPlatformGateway,
  type EditorPlatformGateway,
} from '../application/editorPlatformGateway';
import { EMPTY_DIALOGUE_MESSAGE } from '../editorMessages';

// Transitional re-export for callers outside feature code. Renderer features
// import the port definitions directly from application/authoringPorts.
export type * from '../application/authoringPorts';

export type OpenProjectStatus =
  | 'opened'
  | 'cancelled'
  | 'failed';

export type ImportAssetStatus = ImportAssetResult['status'] | 'failed';
export type ImportImageStatus = ImportAssetStatus;
export type ExportGameStatus = 'exported' | 'cancelled' | 'failed';

function requestInitialProject(
  platform: EditorPlatformGateway,
): Promise<EngineMutationResult> {
  // 每个 BrowserWindow 都拥有独立后端；不可使用模块级 Promise，否则开发
  // StrictMode 或同一 Renderer 进程中的另一窗口可能读到错误项目。
  return platform.engine.ensureProject();
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
export function useEngineProject(
  platform: EditorPlatformGateway = getEditorPlatformGateway(),
) {
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
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
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
    isSaving ||
    isExporting;

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
      requestInitialProject(platform),
      platform.projectFiles.getSession(),
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
      setExportMessage('');

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
    const result = await runEngineAction(() => platform.engine.getProject());
    return result?.project ?? null;
  }

  const authoringActions = createAuthoringActions({
    commands: platform.engine,
    run: runEngineAction,
    onSceneJumpUnavailable: () => {
      setEngineMessage('场景跳转模块尚未加载，请完全退出并重新启动编辑器');
    },
  });

  async function createProject(name?: string): Promise<boolean> {
    if (fileOperationInProgress.current) {
      return false;
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      await platform.projectFiles.createProject(name);
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
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.projectFiles.openProject();

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
    setExportMessage('');

    try {
      if (prepare && !(await prepare())) {
        return false;
      }
      await waitForEngineActions();
      const outcome = await platform.projectFiles.saveProject();

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

  async function exportGame(
    prepare?: () => Promise<boolean>,
    request: GameExportRequest = { output: 'runtime-bundle' },
  ): Promise<ExportGameStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsExporting(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      // 导出必须来自一次已提交、已保存的权威 revision。即使项目当前看似
      // clean，也再次走保存边界，让首次保存和媒体发布使用同一条安全流程。
      if (prepare && !(await prepare())) {
        return 'failed';
      }

      await waitForEngineActions();
      setIsSaving(true);
      const saveOutcome = await platform.projectFiles.saveProject();
      setIsSaving(false);

      if (saveOutcome.cancelled) {
        setSession(saveOutcome.session);
        setExportMessage('已取消保存，未开始导出');
        return 'cancelled';
      }

      applyResult(saveOutcome.result, saveOutcome.session);
      setProjectGeneration((current) => current + 1);

      const savedSession = {
        ...saveOutcome.session,
        ...saveOutcome.result.session,
      };
      if (
        !savedSession.hasStorage ||
        savedSession.isDirty ||
        savedSession.savedRevision !== savedSession.revision
      ) {
        throw new Error('项目尚未完整保存，无法导出游戏');
      }

      const outcome = await platform.gameExport.exportGame(request);
      if (outcome.cancelled) {
        setExportMessage('已取消导出');
        return 'cancelled';
      }

      if (outcome.sourceRevision !== savedSession.revision) {
        throw new Error('导出版本与已保存项目不一致，请重试');
      }

      setExportMessage(exportCompletedMessage(outcome));
      return 'exported';
    } catch (error: unknown) {
      setEngineMessage(readableError(error));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsSaving(false);
      setIsExporting(false);
    }
  }

  async function renameProject(name: string): Promise<boolean> {
    const result = await runEngineAction(() =>
      platform.engine.renameProject(name),
    );
    return result !== null;
  }

  async function setSceneBackground(
    sceneId: string,
    assetId: string | null,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      platform.engine.setSceneBackground(sceneId, assetId),
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
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.assets.importImage();

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
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.assets.importVideo();

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
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.assets.importAudio();

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
    isExporting,
    isBusy,
    engineMessage,
    exportMessage,
    setEngineMessage,
    runEngineAction,
    authoringCommands: platform.engine,
    ...authoringActions,
    createProject,
    openProject,
    saveProject,
    exportGame,
    importImage,
    importVideo,
    importAudio,
    renameProject,
    setSceneBackground,
    waitForEngineActions,
    getProjectSnapshot,
  };
}

function exportCompletedMessage(
  outcome: ExportGameCompletedResult,
): string {
  const kind =
    outcome.output === 'standalone-application'
      ? '独立游戏 ZIP'
      : '内容包';
  return `已导出${kind} ${outcome.artifactName}（${outcome.assetCount} 项资源）`;
}

export type EngineProjectState = ReturnType<typeof useEngineProject>;
