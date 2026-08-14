import { useEffect, useRef, useState } from 'react';

type PreviewVideoProps = {
  assetId: string;
  sequence: number;
  onComplete: () => void;
};

type VideoSourceState = {
  key: string;
  url: string | null;
  errorMessage: string | null;
};

// Video playback is deliberately isolated from the pure preview runtime.
// Renderer receives only a revocable capability URL; Main keeps the host path.
export function PreviewVideo({
  assetId,
  sequence,
  onComplete,
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

    void window.vnAssets.getMediaUrl(assetId)
      .then((url) => {
        if (cancelled) {
          return;
        }
        setSource({
          key: playbackKey,
          url,
          errorMessage: url === null
            ? '视频资源不可用，按 Enter 跳过后继续预览'
            : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSource({
            key: playbackKey,
            url: null,
            errorMessage: '视频资源读取失败，按 Enter 跳过后继续预览',
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
  }, [assetId, playbackKey]);

  const isCurrentSource = source.key === playbackKey;
  const url = isCurrentSource ? source.url : null;
  const errorMessage = isCurrentSource ? source.errorMessage : null;

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
        autoPlay
        disablePictureInPicture
        playsInline
        preload="auto"
        onCanPlay={(event) => {
          void event.currentTarget.play().catch(() => {
            setSource((current) => current.key === playbackKey
                ? {
                  ...current,
                  errorMessage: '自动播放被阻止，按 Enter 跳过后继续预览',
                }
              : current);
          });
        }}
        onEnded={onComplete}
        onError={() => {
          // src 尚未解析时浏览器可能发出空源错误，不覆盖加载状态。
          if (url !== null) {
            setSource((current) => current.key === playbackKey
                ? {
                  ...current,
                  errorMessage: '视频无法解码或已损坏，按 Enter 跳过后继续预览',
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
