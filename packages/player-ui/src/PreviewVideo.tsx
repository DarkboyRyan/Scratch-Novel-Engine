import { useCallback, useEffect, useRef, useState } from 'react';

import type { MediaUrlResolver } from './mediaPort';
import { clampMediaVolume } from './mediaVolume';

export type PreviewVideoProps = {
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
  errorMessage: string | null;
};

export function PreviewVideo({
  assetId,
  sequence,
  resolveMediaUrl,
  onComplete,
  paused = false,
  volume = 1,
}: PreviewVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackKey = `${sequence}:${assetId}`;
  const [source, setSource] = useState<VideoSourceState>({
    key: playbackKey,
    url: null,
    errorMessage: null,
  });

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    setSource({ key: playbackKey, url: null, errorMessage: null });

    void resolveMediaUrl(assetId)
      .then((url) => {
        if (cancelled) {
          return;
        }
        setSource({
          key: playbackKey,
          url,
          errorMessage: url === null
            ? '视频资源不可用，按 Enter 跳过后继续剧情'
            : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSource({
            key: playbackKey,
            url: null,
            errorMessage: '视频资源读取失败，按 Enter 跳过后继续剧情',
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
  const errorMessage = isCurrentSource ? source.errorMessage : null;
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
            errorMessage: '自动播放被阻止，按 Enter 跳过后继续剧情',
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
      aria-label="剧情视频"
      onPointerUp={(event) => event.stopPropagation()}
    >
      <video
        ref={videoRef}
        className="game-preview-video"
        aria-label="剧情视频，按 Enter 跳过"
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
                  errorMessage: '视频无法解码或已损坏，按 Enter 跳过后继续剧情',
                }
              : current);
          }
        }}
      />

      {url === null && errorMessage === null ? (
        <div className="game-preview-video-message" role="status">
          正在加载视频…
        </div>
      ) : null}
      {errorMessage ? (
        <div
          className="game-preview-video-message game-preview-video-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
