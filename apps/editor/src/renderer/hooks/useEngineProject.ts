import { useEffect, useRef, useState } from 'react';

import type {
  AddDialogueParams,
  DeleteDialoguesParams,
  EngineMutationResult,
  ReorderDialogueParams,
  ReorderDialoguesParams,
} from '../../shared/engineProtocol';
import type { ProjectDocument } from '../../shared/projectTypes';
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

export type ReorderDialogueAction = (
  params: ReorderDialogueParams,
) => Promise<boolean>;

export type ReorderDialoguesAction = (
  params: ReorderDialoguesParams,
) => Promise<boolean>;

export type DeleteDialoguesAction = (
  params: DeleteDialoguesParams,
) => Promise<boolean>;

export type OpenProjectStatus =
  | 'opened'
  | 'cancelled'
  | 'failed';

function requestInitialProject(): Promise<EngineMutationResult> {
  // 每个 BrowserWindow 都拥有独立后端；不可使用模块级 Promise，否则开发
  // StrictMode 或同一 Renderer 进程中的另一窗口可能读到错误项目。
  return window.vnEngine.ensureProject();
}

function readableError(error: unknown): string {
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
  const [isInitializing, setIsInitializing] = useState(true);
  const [pendingEngineActions, setPendingEngineActions] = useState(0);
  const [isFileOperating, setIsFileOperating] = useState(false);
  const [engineMessage, setEngineMessage] = useState('');
  const [projectFilePath, setProjectFilePath] =
    useState<string | null>(null);
  const [session, setSession] = useState<ProjectFileSessionSnapshot>({
    filePath: null,
    revision: 0,
    savedRevision: null,
    isDirty: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const fileOperationInProgress = useRef(false);
  const engineActionQueue = useRef<Promise<void>>(Promise.resolve());
  const isBusy =
    isInitializing ||
    pendingEngineActions > 0 ||
    isFileOperating ||
    isSaving;

  useEffect(() => {
    let isActive = true;

    void Promise.all([
      requestInitialProject(),
      window.vnProjectFiles.getSession(),
    ])
      .then(([result, session]) => {
        if (isActive) {
          setProject(result.project);
          setProjectFilePath(session.filePath);
          setSession({
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
        setProject(result.project);
        setSession((current) => ({
          ...current,
          ...result.session,
        }));
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
      setProject(outcome.result.project);
      setProjectFilePath(outcome.session.filePath);
      setSession(outcome.session);
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
      setSession(outcome.session);
      setProjectFilePath(outcome.session.filePath);

      if (outcome.cancelled) {
        return false;
      }

      setProject(outcome.result.project);
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

  return {
    project,
    projectFilePath,
    session,
    isSaving,
    isBusy,
    engineMessage,
    setEngineMessage,
    runEngineAction,
    addDialogue,
    updateDialogue,
    reorderDialogue,
    reorderDialogues,
    deleteDialogues,
    createProject,
    openProject,
    saveProject,
    renameProject,
    waitForEngineActions,
  };
}

export type EngineProjectState = ReturnType<typeof useEngineProject>;
