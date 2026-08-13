import { useState } from 'react';

import type { ProjectDocument } from '../../../shared/projectTypes';
import {
  advanceGamePreview,
  startGamePreview,
  type GamePreviewRuntime,
} from './previewRuntime';

export type GamePreviewSession = {
  project: ProjectDocument;
  runtime: GamePreviewRuntime;
};

export function useGamePreview() {
  const [session, setSession] = useState<GamePreviewSession | null>(null);

  function start(project: ProjectDocument): boolean {
    const runtime = startGamePreview(project);
    if (!runtime) {
      return false;
    }
    setSession({ project, runtime });
    return true;
  }

  function advance(): void {
    setSession((current) => {
      if (!current || current.runtime.status !== 'playing') {
        return current;
      }
      return {
        ...current,
        runtime: advanceGamePreview(current.project, current.runtime),
      };
    });
  }

  function exit(): void {
    setSession(null);
  }

  return { session, start, advance, exit };
}
