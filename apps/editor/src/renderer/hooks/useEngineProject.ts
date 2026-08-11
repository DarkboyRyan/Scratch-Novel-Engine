import { useEffect, useState } from 'react';

import type { EngineMutationResult } from '../../shared/engineProtocol';
import type { ProjectDocument } from '../../shared/projectTypes';
import { EMPTY_DIALOGUE_MESSAGE } from '../editorMessages';

export type AddDialogueAction = (
  sceneId: string,
  afterNodeId?: string | null,
) => Promise<boolean>;

export type UpdateDialogueAction = (
  sceneId: string,
  nodeId: string,
  speaker: string,
  text: string,
) => Promise<boolean>;

// StrictMode 会在开发环境重复挂载。共享初始化 Promise 可以避免因此向 C++
// 连续发送两个 ensureProject 请求。
let initialProjectRequest: Promise<EngineMutationResult> | null = null;

function requestInitialProject(): Promise<EngineMutationResult> {
  if (!initialProjectRequest) {
    initialProjectRequest = window.vnEngine
      .ensureProject()
      .catch((error: unknown) => {
        initialProjectRequest = null;
        throw error;
      });
  }

  return initialProjectRequest;
}

function readableError(error: unknown): string {
  if (
    error instanceof Error &&
    error.message.includes('dialogue text must not be empty')
  ) {
    return EMPTY_DIALOGUE_MESSAGE;
  }

  return error instanceof Error
    ? error.message
    : 'C++ 后端发生了未知错误';
}

// 这一层只协调“Project 快照 ↔ C++ API”，不知道当前选中了哪个节点。
export function useEngineProject() {
  const [project, setProject] =
    useState<ProjectDocument | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [engineMessage, setEngineMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    void requestInitialProject()
      .then((result) => {
        if (isActive) {
          setProject(result.project);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setEngineMessage(readableError(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsBusy(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function runEngineAction(
    action: () => Promise<EngineMutationResult>,
  ): Promise<EngineMutationResult | null> {
    setIsBusy(true);
    setEngineMessage('');

    try {
      const result = await action();
      setProject(result.project);
      return result;
    } catch (error: unknown) {
      setEngineMessage(readableError(error));
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function addDialogue(
    sceneId: string,
    afterNodeId?: string | null,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      window.vnEngine.addDialogue(sceneId, afterNodeId),
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

  return {
    project,
    isBusy,
    engineMessage,
    setEngineMessage,
    runEngineAction,
    addDialogue,
    updateDialogue,
  };
}

export type EngineProjectState = ReturnType<typeof useEngineProject>;
