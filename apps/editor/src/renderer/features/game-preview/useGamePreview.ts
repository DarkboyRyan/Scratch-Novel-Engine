/**
 * 文件主要作用：创建并维护编辑器内游戏预览会话状态。
 * 包含实现：`GamePreviewSession`、`useGamePreview`。
 */

import { useState } from 'react';

import type { ProjectDocument as RuntimeProjectDocument } from '@vnengine/runtime';

import {
  toRuntimeProjectDocument,
  type ProjectDocument,
} from '../../../shared/projectTypes';
import {
  advanceGamePreview,
  completeGamePreviewCgLeadIn,
  selectGamePreviewChoice,
  startGamePreview,
  startGamePreviewAtScene,
  type GamePreviewRuntime,
} from './previewRuntime';

export type GamePreviewSession = {
  phase: 'title' | 'story';
  project: RuntimeProjectDocument;
  runtime: GamePreviewRuntime;
};

export function useGamePreview() {
  const [session, setSession] = useState<GamePreviewSession | null>(null);

  function start(project: ProjectDocument, sceneId: string): boolean {
    const runtimeProject = toRuntimeProjectDocument(project);
    const runtime = startGamePreviewAtScene(runtimeProject, sceneId);
    if (!runtime) {
      return false;
    }
    setSession({ phase: 'story', project: runtimeProject, runtime });
    return true;
  }

  function startWhole(project: ProjectDocument): boolean {
    const runtimeProject = toRuntimeProjectDocument(project);
    const runtime = startGamePreview(runtimeProject);
    if (!runtime) {
      return false;
    }
    setSession({ phase: 'title', project: runtimeProject, runtime });
    return true;
  }

  function enterStory(): void {
    setSession((current) =>
      current?.phase === 'title'
        ? { ...current, phase: 'story' }
        : current,
    );
  }

  function advance(): void {
    setSession((current) => {
      if (
        !current ||
        current.phase !== 'story' ||
        current.runtime.status !== 'playing'
      ) {
        return current;
      }
      return {
        ...current,
        runtime: advanceGamePreview(current.project, current.runtime),
      };
    });
  }

  function completeVideo(): void {
    setSession((current) => {
      if (
        !current ||
        current.phase !== 'story' ||
        current.runtime.status !== 'playingVideo'
      ) {
        return current;
      }
      return {
        ...current,
        runtime: advanceGamePreview(current.project, current.runtime),
      };
    });
  }

  function completeCgLeadIn(): void {
    setSession((current) => {
      if (
        !current ||
        current.phase !== 'story' ||
        current.runtime.status !== 'waitingCgLeadIn'
      ) {
        return current;
      }
      return {
        ...current,
        runtime: completeGamePreviewCgLeadIn(
          current.project,
          current.runtime,
        ),
      };
    });
  }

  function selectChoice(optionId: string): void {
    setSession((current) => {
      if (
        !current ||
        current.phase !== 'story' ||
        current.runtime.status !== 'choosing'
      ) {
        return current;
      }
      return {
        ...current,
        runtime: selectGamePreviewChoice(
          current.project,
          current.runtime,
          optionId,
        ),
      };
    });
  }

  function exit(): void {
    setSession(null);
  }

  return {
    session,
    start,
    startWhole,
    enterStory,
    advance,
    completeVideo,
    completeCgLeadIn,
    selectChoice,
    exit,
  };
}
