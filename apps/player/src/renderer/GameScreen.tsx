import { useEffect, useMemo, useRef } from 'react';
import {
  PreviewVideo,
  VisualStage,
  usePreviewAudio,
  type MediaUrlResolver,
  type PreviewCharacter,
} from '@vnengine/player-ui';
import {
  getChoices,
  type GameRuntime,
  type ProjectDocument,
} from '@vnengine/runtime';

import type { PlayerAssetView } from './playerGateway';
import { useResolvedMediaUrls } from './useResolvedMediaUrls';

type GameScreenProps = {
  project: ProjectDocument;
  assets: readonly PlayerAssetView[];
  runtime: GameRuntime;
  paused: boolean;
  canOpenGame: boolean;
  openingGame: boolean;
  resolveMediaUrl: MediaUrlResolver;
  onAdvance(): void;
  onCompleteVideo(): void;
  onSelectChoice(optionId: string): void;
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onOpenGame(): void;
  onExit(): void;
};

function stoppedAudioRuntime(runtime: GameRuntime): GameRuntime {
  return {
    ...runtime,
    status: 'finished',
    videoAssetId: null,
    dialogue: null,
    choices: [],
  };
}

export function GameScreen({
  project,
  assets,
  runtime,
  paused,
  canOpenGame,
  openingGame,
  resolveMediaUrl,
  onAdvance,
  onCompleteVideo,
  onSelectChoice,
  onPause,
  onResume,
  onRestart,
  onOpenGame,
  onExit,
}: GameScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRuntime = useMemo(
    () => paused ? stoppedAudioRuntime(runtime) : runtime,
    [paused, runtime],
  );
  usePreviewAudio(audioRuntime, resolveMediaUrl);

  const visibleAssetIds = [
    runtime.backgroundAssetId,
    ...runtime.characters.map((character) => character.assetId),
  ];
  const mediaUrls = useResolvedMediaUrls(visibleAssetIds, resolveMediaUrl);
  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const backgroundAsset = runtime.backgroundAssetId
    ? assetById.get(runtime.backgroundAssetId) ?? null
    : null;
  const characters: PreviewCharacter[] = runtime.characters.map(
    (character) => ({
      id: character.nodeId,
      url: mediaUrls[character.assetId] ?? null,
      name: assetById.get(character.assetId)?.displayName ?? '缺失立绘',
      slot: character.slot,
      layer: character.layer,
      position: character.position,
    }),
  );
  const choices = getChoices(project, runtime);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const video = rootRef.current?.querySelector('video');
    if (!video) {
      return;
    }
    if (paused) {
      video.pause();
    } else if (runtime.status === 'playingVideo') {
      void video.play().catch(() => {});
    }
  }, [paused, runtime.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (runtime.status === 'finished' || runtime.status === 'runtimeError') {
          return;
        }
        if (paused) {
          onResume();
        } else {
          onPause();
        }
        return;
      }
      if (paused) {
        return;
      }
      if (event.target instanceof Element && event.target.closest('button')) {
        return;
      }
      if (runtime.status === 'playingVideo' && event.key === 'Enter') {
        event.preventDefault();
        onCompleteVideo();
      } else if (
        runtime.status === 'playing' &&
        (event.key === ' ' || event.key === 'Enter')
      ) {
        event.preventDefault();
        onAdvance();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onAdvance,
    onCompleteVideo,
    onPause,
    onResume,
    paused,
    runtime.status,
  ]);

  return (
    <main
      ref={rootRef}
      className="player-game"
      tabIndex={-1}
      aria-label="游戏画面"
      onPointerUp={(event) => {
        if (
          event.button === 0 &&
          !paused &&
          runtime.status === 'playing'
        ) {
          onAdvance();
        }
      }}
    >
      <VisualStage
        className="player-stage"
        speaker={runtime.dialogue?.speaker ?? ''}
        text={runtime.dialogue?.text ?? ''}
        backgroundUrl={
          runtime.backgroundAssetId
            ? mediaUrls[runtime.backgroundAssetId] ?? null
            : null
        }
        backgroundName={backgroundAsset?.displayName ?? null}
        showDialogue={
          !paused && runtime.status === 'playing' && runtime.dialogue !== null
        }
        characters={characters}
        placeholder="暂无背景"
      >
        {runtime.status === 'playingVideo' && runtime.videoAssetId ? (
          <PreviewVideo
            assetId={runtime.videoAssetId}
            sequence={runtime.videoSequence}
            resolveMediaUrl={resolveMediaUrl}
            onComplete={onCompleteVideo}
          />
        ) : null}

        {!paused && runtime.status === 'choosing' ? (
          <div className="player-choice-layer">
            <div
              className="player-choice-list"
              role="group"
              aria-label="请选择接下来的行动"
            >
              {choices.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="player-choice-button"
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={() => onSelectChoice(option.id)}
                >
                  {option.text || '未命名选项'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {paused ? (
          <div
            className="player-menu-layer"
            role="dialog"
            aria-modal="true"
            aria-label="暂停菜单"
            onPointerUp={(event) => event.stopPropagation()}
          >
            <section className="player-menu-card">
              <p className="player-eyebrow">PAUSED</p>
              <h2>游戏已暂停</h2>
              <button type="button" onClick={onResume}>继续游戏</button>
              <button type="button" onClick={onRestart}>重新开始</button>
              {canOpenGame ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={openingGame}
                  onClick={onOpenGame}
                >
                  {openingGame ? '正在打开…' : '打开其他游戏'}
                </button>
              ) : null}
              <button type="button" className="secondary" onClick={onExit}>
                退出游戏
              </button>
            </section>
          </div>
        ) : null}

        {runtime.status === 'finished' ? (
          <div
            className="player-menu-layer"
            role="dialog"
            aria-modal="true"
            aria-label="游戏结束"
            onPointerUp={(event) => event.stopPropagation()}
          >
            <section className="player-menu-card">
              <p className="player-eyebrow">THE END</p>
              <h2>故事结束</h2>
              <button type="button" onClick={onRestart}>重新开始</button>
              {canOpenGame ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={openingGame}
                  onClick={onOpenGame}
                >
                  {openingGame ? '正在打开…' : '打开其他游戏'}
                </button>
              ) : null}
              <button type="button" className="secondary" onClick={onExit}>
                退出游戏
              </button>
            </section>
          </div>
        ) : null}

        {runtime.status === 'runtimeError' ? (
          <div
            className="player-menu-layer"
            role="alertdialog"
            aria-modal="true"
            aria-label="运行错误"
            onPointerUp={(event) => event.stopPropagation()}
          >
            <section className="player-menu-card player-error-card">
              <p className="player-eyebrow">RUNTIME ERROR</p>
              <h2>游戏无法继续</h2>
              <p>{runtime.errorMessage ?? '剧情数据发生错误。'}</p>
              <button type="button" onClick={onRestart}>重新开始</button>
              {canOpenGame ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={openingGame}
                  onClick={onOpenGame}
                >
                  {openingGame ? '正在打开…' : '打开其他游戏'}
                </button>
              ) : null}
              <button type="button" className="secondary" onClick={onExit}>
                退出游戏
              </button>
            </section>
          </div>
        ) : null}
      </VisualStage>

      {!paused &&
      runtime.status !== 'finished' &&
      runtime.status !== 'runtimeError' ? (
        <button
          type="button"
          className="player-pause-button"
          aria-label="暂停游戏"
          title="暂停游戏（Esc）"
          onPointerUp={(event) => event.stopPropagation()}
          onClick={onPause}
        >
          <span aria-hidden="true">Ⅱ</span>
        </button>
      ) : null}
    </main>
  );
}
