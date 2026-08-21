import { useEffect, useRef, useState } from 'react';
import type { StartScreenDocument } from '@vnengine/runtime';

import type { MediaUrlResolver } from './mediaPort';

export type TitleScreenProps = {
  startScreen: StartScreenDocument;
  resolveMediaUrl: MediaUrlResolver;
  openingGame?: boolean;
  onStart: () => void;
  onOpenGame?: () => void;
  onExit: () => void;
};

function useResolvedTitleAsset(
  assetId: string | null,
  resolveMediaUrl: MediaUrlResolver,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (assetId === null) {
      return () => {
        active = false;
      };
    }
    void resolveMediaUrl(assetId)
      .then((resolvedUrl) => {
        if (active) {
          setUrl(resolvedUrl);
        }
      })
      .catch(() => {
        if (active) {
          setUrl(null);
        }
      });
    return () => {
      active = false;
    };
  }, [assetId, resolveMediaUrl]);

  return url;
}

export function TitleScreen({
  startScreen,
  resolveMediaUrl,
  openingGame = false,
  onStart,
  onOpenGame,
  onExit,
}: TitleScreenProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const backgroundUrl = useResolvedTitleAsset(
    startScreen.backgroundAssetId,
    resolveMediaUrl,
  );
  const musicUrl = useResolvedTitleAsset(
    startScreen.musicAssetId,
    resolveMediaUrl,
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null || musicUrl === null || !musicEnabled) {
      audio?.pause();
      return;
    }
    audio.loop = true;
    // Browser autoplay policy may reject this promise. The title screen stays
    // interactive; the user can retry by toggling music in Options.
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [musicEnabled, musicUrl]);

  return (
    <main className="player-shell player-title-page">
      {backgroundUrl !== null ? (
        <img
          className="player-title-background"
          src={backgroundUrl}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <div className="player-title-scrim" aria-hidden="true" />
      {musicUrl !== null ? (
        <audio
          ref={audioRef}
          className="player-title-music"
          src={musicUrl}
          loop
          preload="auto"
        />
      ) : null}
      <section className="player-title-card">
        <p className="player-eyebrow">A VN ENGINE STORY</p>
        <h1>{startScreen.title || '未命名游戏'}</h1>
        <div className="player-title-actions player-title-actions-vertical">
          <button
            type="button"
            className="player-start-button"
            onClick={onStart}
          >
            <span aria-hidden="true">▶</span>
            开始游戏
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setOptionsOpen(true)}
          >
            选项
          </button>
          <button type="button" className="secondary" onClick={onExit}>
            退出游戏
          </button>
        </div>
      </section>
      {optionsOpen ? (
        <div
          className="player-menu-layer"
          role="dialog"
          aria-modal="true"
          aria-label="选项"
        >
          <section className="player-menu-card">
            <p className="player-eyebrow">OPTIONS</p>
            <h2>选项</h2>
            {musicUrl !== null ? (
              <button
                type="button"
                className="secondary"
                onClick={() => setMusicEnabled((enabled) => !enabled)}
              >
                {musicEnabled ? '关闭主界面音乐' : '开启主界面音乐'}
              </button>
            ) : null}
            {onOpenGame ? (
              <button
                type="button"
                className="secondary"
                disabled={openingGame}
                onClick={() => {
                  setOptionsOpen(false);
                  onOpenGame();
                }}
              >
                {openingGame ? '正在打开…' : '打开其他游戏'}
              </button>
            ) : null}
            <button type="button" onClick={() => setOptionsOpen(false)}>
              返回
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
