/**
 * 主要作用：把 React 生命周期桥接到预览音频控制器。
 * 关键函数与实现：`usePreviewAudio`；以 TypeScript 类型边界和可组合函数实现。
 */
import { useEffect, useRef } from 'react';
import type { GameRuntime } from '@vnengine/runtime';

import type { MediaUrlResolver } from './mediaPort';
import {
  createPreviewAudioController,
  type PreviewAudioController,
  type PreviewAudioSyncOptions,
} from './previewAudioController';

export function usePreviewAudio(
  runtime: GameRuntime,
  resolveMediaUrl: MediaUrlResolver,
  {
    bgmVolume = 1,
    voiceVolume = 1,
    paused = false,
  }: PreviewAudioSyncOptions = {},
): void {
  const controllerRef = useRef<PreviewAudioController | null>(null);
  const latestRuntimeRef = useRef(runtime);
  const latestOptionsRef = useRef<PreviewAudioSyncOptions>({
    bgmVolume,
    voiceVolume,
    paused,
  });
  latestRuntimeRef.current = runtime;
  latestOptionsRef.current = { bgmVolume, voiceVolume, paused };

  useEffect(() => {
    const controller = createPreviewAudioController({ resolveMediaUrl });
    controllerRef.current = controller;
    controller.sync(latestRuntimeRef.current, latestOptionsRef.current);

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [resolveMediaUrl]);

  useEffect(() => {
    controllerRef.current?.sync(runtime, {
      bgmVolume,
      voiceVolume,
      paused,
    });
  }, [bgmVolume, paused, runtime, voiceVolume]);
}
