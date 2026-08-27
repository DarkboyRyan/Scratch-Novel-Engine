/**
 * 主要作用：解析并播放场景视频，处理音量、暂停、结束和错误回退。
 * 关键函数与实现：`PreviewVideoProps`、`PreviewVideo`；基于 React 组件、Hooks、可访问交互与受控状态实现。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlayerUiLocalizationProps } from './localization';
import type { MediaUrlResolver } from './mediaPort';
import { clampMediaVolume } from './mediaVolume';
import { usePlayerUiLabels } from './PlayerUiProvider';

export type PreviewVideoProps = PlayerUiLocalizationProps & {
  assetId: string;
  sequence: number;
  resolveMediaUrl: MediaUrlResolver;
  onComplete: () => void;
  paused?: boolean;
  volume?: number;
};

type VideoSourceState = {
  key: string;
  url: string | null;
  errorCode: VideoErrorCode | null;
};

type VideoErrorCode =
  | 'unavailable'
  | 'readFailed'
  | 'autoplayBlocked'
  | 'decodeFailed';

export function PreviewVideo({
  language,
  labels: labelsOverride,
  assetId,
  sequence,
  resolveMediaUrl,
  onComplete,
  paused = false,
  volume = 1,
}: PreviewVideoProps) {
  const labels = usePlayerUiLabels(language, labelsOverride).video;
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackKey = `${sequence}:${assetId}`;
  const [source, setSource] = useState<VideoSourceState>({
    key: playbackKey,
    url: null,
    errorCode: null,
  });

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    setSource({ key: playbackKey, url: null, errorCode: null });

    void resolveMediaUrl(assetId)
      .then((url) => {
        if (cancelled) {
          return;
        }
        setSource({
          key: playbackKey,
          url,
          errorCode: url === null ? 'unavailable' : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSource({
            key: playbackKey,
            url: null,
            errorCode: 'readFailed',
          });
        }
      });

    return () => {
      cancelled = true;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [assetId, playbackKey, resolveMediaUrl]);

  const isCurrentSource = source.key === playbackKey;
  const url = isCurrentSource ? source.url : null;
  const errorCode = isCurrentSource ? source.errorCode : null;
  const normalizedVolume = clampMediaVolume(volume);
  const volumeRef = useRef(normalizedVolume);
  volumeRef.current = normalizedVolume;
  const playVideo = useCallback((video: HTMLVideoElement) => {
    video.volume = volumeRef.current;
    if (paused) {
      video.pause();
      return;
    }
    void video.play().catch(() => {
      setSource((current) => current.key === playbackKey
          ? {
            ...current,
            errorCode: 'autoplayBlocked',
          }
        : current);
    });
  }, [paused, playbackKey]);

  useEffect(() => {
    if (videoRef.current !== null) {
      videoRef.current.volume = normalizedVolume;
    }
  }, [normalizedVolume]);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    if (paused) {
      video.pause();
    } else if (url !== null) {
      playVideo(video);
    }
  }, [paused, playVideo, url]);

  return (
    <div
      className="game-preview-video-layer"
      aria-label={labels.ariaLabel}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <video
        ref={videoRef}
        className="game-preview-video"
        aria-label={labels.skippableAriaLabel}
        src={url ?? undefined}
        disablePictureInPicture
        playsInline
        preload="auto"
        onCanPlay={(event) => {
          event.currentTarget.volume = normalizedVolume;
          playVideo(event.currentTarget);
        }}
        onEnded={() => {
          if (!paused) {
            onComplete();
          }
        }}
        onError={() => {
          if (url !== null) {
            setSource((current) => current.key === playbackKey
                ? {
                  ...current,
                  errorCode: 'decodeFailed',
                }
              : current);
          }
        }}
      />

      {url === null && errorCode === null ? (
        <div className="game-preview-video-message" role="status">
          {labels.loading}
        </div>
      ) : null}
      {errorCode !== null ? (
        <div
          className="game-preview-video-message game-preview-video-error"
          role="alert"
        >
          {labels[errorCode]}
        </div>
      ) : null}
    </div>
  );
}
