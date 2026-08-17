import { useEffect, useRef } from 'react';
import type { GameRuntime } from '@vnengine/runtime';

import type { MediaUrlResolver } from './mediaPort';
import {
  createPreviewAudioController,
  type PreviewAudioController,
} from './previewAudioController';

export function usePreviewAudio(
  runtime: GameRuntime,
  resolveMediaUrl: MediaUrlResolver,
): void {
  const controllerRef = useRef<PreviewAudioController | null>(null);
  const latestRuntimeRef = useRef(runtime);
  latestRuntimeRef.current = runtime;

  useEffect(() => {
    const controller = createPreviewAudioController({ resolveMediaUrl });
    controllerRef.current = controller;
    controller.sync(latestRuntimeRef.current);

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [resolveMediaUrl]);

  useEffect(() => {
    controllerRef.current?.sync(runtime);
  }, [runtime]);
}
