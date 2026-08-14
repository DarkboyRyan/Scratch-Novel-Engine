import { useEffect, useRef } from 'react';

import type { GamePreviewRuntime } from './previewRuntime';
import {
  createPreviewAudioController,
  type PreviewAudioController,
} from './previewAudioController';

export function usePreviewAudio(runtime: GamePreviewRuntime): void {
  const controllerRef = useRef<PreviewAudioController | null>(null);
  const latestRuntimeRef = useRef(runtime);
  latestRuntimeRef.current = runtime;

  useEffect(() => {
    const controller = createPreviewAudioController();
    controllerRef.current = controller;
    controller.sync(latestRuntimeRef.current);

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.sync(runtime);
  }, [runtime]);
}
