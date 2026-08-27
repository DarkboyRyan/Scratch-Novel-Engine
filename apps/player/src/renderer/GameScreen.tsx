/**
 * 主要作用：渲染运行场景并协调对白、选项、CG、媒体、快进和操作栏。
 * 关键函数与实现：`GameScreen`；基于 React 组件、Hooks、可访问交互与受控状态实现。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GameActionBar,
  PreviewVideo,
  VisualStage,
  usePreviewAudio,
  usePlayerUiLabels,
  type MediaUrlResolver,
  type PreviewCharacter,
} from '@vnengine/player-ui';
import {
  getChoices,
  getLocalizedRuntimeErrorMessage,
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
  mediaPaused: boolean;
  interactionBlocked: boolean;
  bgmVolume: number;
  voiceVolume: number;
  videoVolume: number;
  quickSaveBusy: boolean;
  quickLoadBusy: boolean;
  canOpenGame: boolean;
  openingGame: boolean;
  resolveMediaUrl: MediaUrlResolver;
  onAdvance(): void;
  onCompleteCgLeadIn(): void;
  onCompleteVideo(): void;
  onSelectChoice(optionId: string): void;
  onPause(): void;
  onResume(): void;
  onSave(): void;
  onLoad(): void;
  onQuickSave(): void;
  onQuickLoad(): void;
  onOptions(): void;
  onRestart(): void;
  onOpenGame(): void;
  onReturnToTitle(): void;
};

const FAST_FORWARD_HOLD_DELAY_MS = 300;
const FAST_FORWARD_STEP_MS = 120;

type CgMediaState = {
  key: string;
  status: 'resolving' | 'loading' | 'ready' | 'error';
  url: string | null;
};

type DialoguePointerGesture = {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollTop: number;
  element: HTMLElement;
};

function isSpaceKey(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
}

function isTextOrControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(
    'button, input, select, textarea, [contenteditable="true"]',
  ) !== null;
}

export function GameScreen({
  project,
  assets,
  runtime,
  paused,
  mediaPaused,
  interactionBlocked,
  bgmVolume,
  voiceVolume,
  videoVolume,
  quickSaveBusy,
  quickLoadBusy,
  canOpenGame,
  openingGame,
  resolveMediaUrl,
  onAdvance,
  onCompleteCgLeadIn,
  onCompleteVideo,
  onSelectChoice,
  onPause,
  onResume,
  onSave,
  onLoad,
  onQuickSave,
  onQuickLoad,
  onOptions,
  onRestart,
  onOpenGame,
  onReturnToTitle,
}: GameScreenProps) {
  const allLabels = usePlayerUiLabels();
  const labels = allLabels.game;
  const rootRef = useRef<HTMLDivElement>(null);
  const [fastForwardLatched, setFastForwardLatched] = useState(false);
  const [spaceHoldActive, setSpaceHoldActive] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => document.hidden);
  const [cgMedia, setCgMedia] = useState<CgMediaState>({
    key: '',
    status: 'resolving',
    url: null,
  });
  const spacePressedRef = useRef(false);
  const dialoguePointerGestureRef = useRef<DialoguePointerGesture | null>(null);
  const spaceHoldTimerRef = useRef<number | null>(null);
  const cgLeadInTimerRef = useRef<{
    key: string;
    remainingMs: number;
  } | null>(null);
  const inputStateRef = useRef({
    interactionBlocked,
    paused,
    runtimeStatus: runtime.status,
  });
  const onAdvanceRef = useRef(onAdvance);
  inputStateRef.current = {
    interactionBlocked,
    paused,
    runtimeStatus: runtime.status,
  };
  onAdvanceRef.current = onAdvance;
  const fastForwardActive = fastForwardLatched || spaceHoldActive;
  const cgMediaKey = runtime.cgAssetId === null
    ? ''
    : `${runtime.cgAssetId}:${runtime.cgSequence}`;

  const clearSpaceHoldTimer = useCallback(() => {
    if (spaceHoldTimerRef.current !== null) {
      window.clearTimeout(spaceHoldTimerRef.current);
      spaceHoldTimerRef.current = null;
    }
  }, []);

  const stopSpaceHold = useCallback(() => {
    clearSpaceHoldTimer();
    spacePressedRef.current = false;
    setSpaceHoldActive(false);
  }, [clearSpaceHoldTimer]);
  usePreviewAudio(runtime, resolveMediaUrl, {
    bgmVolume,
    voiceVolume,
    paused: paused || mediaPaused,
  });

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
  const cgAsset = runtime.cgAssetId
    ? assetById.get(runtime.cgAssetId) ?? null
    : null;
  const characters: PreviewCharacter[] = runtime.characters.map(
    (character) => ({
      id: character.nodeId,
      url: mediaUrls[character.assetId] ?? null,
      name: assetById.get(character.assetId)?.displayName ??
        labels.missingCharacter,
      slot: character.slot,
      layer: character.layer,
      position: character.position,
      opacity: character.opacity,
      effect: character.effect,
      effectSequence: character.effectSequence,
    }),
  );
  const choices = getChoices(project, runtime);
  const runtimeErrorMessage = getLocalizedRuntimeErrorMessage(
    runtime,
    allLabels.locale,
    labels.runtimeErrorFallback,
  );

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );
  }, []);

  useEffect(() => {
    const assetId = runtime.cgAssetId;
    const key = cgMediaKey;
    if (assetId === null) {
      setCgMedia({ key: '', status: 'resolving', url: null });
      return;
    }
    let cancelled = false;
    setCgMedia({ key, status: 'resolving', url: null });
    void resolveMediaUrl(assetId).then((url) => {
      if (cancelled) {
        return;
      }
      setCgMedia(url === null
        ? { key, status: 'error', url: null }
        : { key, status: 'loading', url });
    }).catch(() => {
      if (!cancelled) {
        setCgMedia({ key, status: 'error', url: null });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cgMediaKey, resolveMediaUrl, runtime.cgAssetId]);

  const completeCgImageLoad = useCallback((image: HTMLImageElement) => {
    const key = cgMediaKey;
    const markReady = () => setCgMedia((current) =>
      current.key === key && current.status === 'loading'
        ? { ...current, status: 'ready' }
        : current);
    if (typeof image.decode !== 'function') {
      markReady();
      return;
    }
    void image.decode().then(markReady).catch(() => {
      setCgMedia((current) => current.key === key
        ? { key, status: 'error', url: null }
        : current);
    });
  }, [cgMediaKey]);

  useEffect(() => {
    if (runtime.status !== 'waitingCgLeadIn') {
      cgLeadInTimerRef.current = null;
      return;
    }
    const key = `${runtime.sceneId}:${runtime.cgSequence}`;
    if (cgLeadInTimerRef.current?.key !== key) {
      cgLeadInTimerRef.current = {
        key,
        remainingMs: runtime.cgLeadInMs,
      };
    }
    if (
      paused ||
      mediaPaused ||
      interactionBlocked ||
      pageHidden ||
      cgMedia.key !== cgMediaKey ||
      cgMedia.status !== 'ready'
    ) {
      return;
    }

    const timerState = cgLeadInTimerRef.current;
    const startedAt = performance.now();
    const timeout = window.setTimeout(() => {
      if (cgLeadInTimerRef.current?.key === key) {
        cgLeadInTimerRef.current.remainingMs = 0;
      }
      onCompleteCgLeadIn();
    }, timerState.remainingMs);
    return () => {
      window.clearTimeout(timeout);
      if (cgLeadInTimerRef.current?.key === key) {
        const elapsed = Math.max(0, performance.now() - startedAt);
        cgLeadInTimerRef.current.remainingMs = Math.max(
          0,
          timerState.remainingMs - elapsed,
        );
      }
    };
  }, [
    interactionBlocked,
    cgMedia.key,
    cgMedia.status,
    cgMediaKey,
    mediaPaused,
    onCompleteCgLeadIn,
    pageHidden,
    paused,
    runtime.cgLeadInMs,
    runtime.cgSequence,
    runtime.sceneId,
    runtime.status,
  ]);

  useEffect(() => {
    if (
      paused ||
      interactionBlocked ||
      runtime.status === 'finished' ||
      runtime.status === 'runtimeError'
    ) {
      setFastForwardLatched(false);
      stopSpaceHold();
    }
  }, [interactionBlocked, paused, runtime.status, stopSpaceHold]);

  useEffect(() => {
    if (
      !fastForwardActive ||
      paused ||
      interactionBlocked ||
      runtime.status !== 'playing'
    ) {
      return;
    }
    const timer = window.setTimeout(onAdvance, FAST_FORWARD_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [
    fastForwardActive,
    interactionBlocked,
    onAdvance,
    paused,
    runtime,
  ]);

  useEffect(() => {
    const handleSpaceDown = (event: KeyboardEvent) => {
      if (
        !isSpaceKey(event) ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        spacePressedRef.current ||
        isTextOrControlTarget(event.target)
      ) {
        return;
      }
      const current = inputStateRef.current;
      if (
        current.interactionBlocked ||
        current.paused ||
        current.runtimeStatus !== 'playing'
      ) {
        return;
      }
      event.preventDefault();
      spacePressedRef.current = true;
      onAdvanceRef.current();
      clearSpaceHoldTimer();
      spaceHoldTimerRef.current = window.setTimeout(() => {
        spaceHoldTimerRef.current = null;
        if (spacePressedRef.current) {
          setSpaceHoldActive(true);
        }
      }, FAST_FORWARD_HOLD_DELAY_MS);
    };
    const handleSpaceUp = (event: KeyboardEvent) => {
      if (!isSpaceKey(event) || !spacePressedRef.current) {
        return;
      }
      event.preventDefault();
      stopSpaceHold();
    };
    const handleWindowBlur = () => {
      setFastForwardLatched(false);
      stopSpaceHold();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setFastForwardLatched(false);
        stopSpaceHold();
      }
    };
    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearSpaceHoldTimer();
      spacePressedRef.current = false;
    };
  }, [clearSpaceHoldTimer, stopSpaceHold]);

  useEffect(() => {
    const video = rootRef.current?.querySelector('video');
    if (!video) {
      return;
    }
    if (paused || interactionBlocked) {
      video.pause();
    } else if (runtime.status === 'playingVideo') {
      void video.play().catch(() => {});
    }
  }, [interactionBlocked, paused, runtime.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (isSpaceKey(event)) {
        return;
      }
      if (interactionBlocked) {
        if (event.key === 'Escape') {
          event.preventDefault();
        }
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
    interactionBlocked,
    paused,
    runtime.status,
  ]);

  return (
    <main
      ref={rootRef}
      className="player-game"
      tabIndex={-1}
      aria-label={labels.screenAria}
      onPointerDown={(event) => {
        dialoguePointerGestureRef.current = null;
        if (event.button !== 0 || !(event.target instanceof Element)) {
          return;
        }
        const dialogue = event.target.closest<HTMLElement>('.dialogue-box');
        if (
          dialogue === null ||
          dialogue.scrollHeight <= dialogue.clientHeight
        ) {
          return;
        }
        dialoguePointerGestureRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          scrollTop: dialogue.scrollTop,
          element: dialogue,
        };
      }}
      onPointerCancel={() => {
        dialoguePointerGestureRef.current = null;
      }}
      onPointerUp={(event) => {
        const dialogueGesture = dialoguePointerGestureRef.current;
        dialoguePointerGestureRef.current = null;
        const scrolledDialogue = dialogueGesture !== null &&
          dialogueGesture.pointerId === event.pointerId &&
          (
            dialogueGesture.element.scrollTop !== dialogueGesture.scrollTop ||
            Math.abs(event.clientX - dialogueGesture.clientX) > 6 ||
            Math.abs(event.clientY - dialogueGesture.clientY) > 6
          );
        if (
          event.button === 0 &&
          !scrolledDialogue &&
          !paused &&
          !interactionBlocked &&
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
        animateCharacters
        animationsPaused={
          paused || mediaPaused || interactionBlocked || pageHidden
        }
        placeholder={labels.noBackground}
      >
        {runtime.cgAssetId ? (
          <div
            className="player-cg-display-layer"
            aria-label={labels.cgAria}
            aria-busy={
              cgMedia.status === 'resolving' || cgMedia.status === 'loading'
            }
          >
            {cgMedia.url ? (
              <img
                src={cgMedia.url}
                alt={cgAsset?.displayName ?? 'CG'}
                onLoad={(event) => completeCgImageLoad(event.currentTarget)}
                onError={() => setCgMedia((current) =>
                  current.key === cgMediaKey
                    ? { key: cgMediaKey, status: 'error', url: null }
                    : current)}
              />
            ) : null}
            {cgMedia.status === 'resolving' || cgMedia.status === 'loading' ? (
              <p className="player-cg-display-message" role="status">
                {labels.cgLoading}
              </p>
            ) : null}
            {cgMedia.status === 'error' ? (
              <div
                className="player-cg-display-error"
                role="alert"
                onPointerUp={(event) => event.stopPropagation()}
              >
                <p>{labels.cgLoadFailed}</p>
                <button type="button" onClick={onReturnToTitle}>
                  {allLabels.common.returnToTitle}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {runtime.status === 'playingVideo' && runtime.videoAssetId ? (
          <PreviewVideo
            assetId={runtime.videoAssetId}
            sequence={runtime.videoSequence}
            resolveMediaUrl={resolveMediaUrl}
            onComplete={onCompleteVideo}
            paused={paused || interactionBlocked}
            volume={videoVolume}
          />
        ) : null}

        {!paused && !interactionBlocked && runtime.status === 'choosing' ? (
          <div className="player-choice-layer">
            <div
              className="player-choice-list"
              role="group"
              aria-label={labels.choicesAria}
            >
              {choices.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="player-choice-button"
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={() => onSelectChoice(option.id)}
                >
                  {option.text || labels.unnamedChoice}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {paused ? (
          <div
            className="player-menu-layer"
            role="dialog"
            aria-modal={interactionBlocked ? undefined : true}
            aria-hidden={interactionBlocked || undefined}
            aria-label={labels.pauseMenuAria}
            inert={interactionBlocked}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <section className="player-menu-card">
              <p className="player-eyebrow">{labels.pausedEyebrow}</p>
              <h2>{labels.pausedTitle}</h2>
              <button
                type="button"
                disabled={interactionBlocked}
                onClick={onResume}
              >
                {labels.continueGame}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={interactionBlocked}
                onClick={onRestart}
              >
                {allLabels.common.restart}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={interactionBlocked}
                onClick={onOptions}
              >
                {allLabels.common.options}
              </button>
              {canOpenGame ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={interactionBlocked || openingGame}
                  onClick={onOpenGame}
                >
                  {openingGame
                    ? allLabels.common.openingGame
                    : allLabels.common.openOtherGame}
                </button>
              ) : null}
              <button
                type="button"
                className="secondary"
                disabled={interactionBlocked}
                onClick={onReturnToTitle}
              >
                {allLabels.common.returnToTitle}
              </button>
            </section>
          </div>
        ) : null}

        {runtime.status === 'finished' ? (
          <div
            className="player-menu-layer"
            role="dialog"
            aria-modal={interactionBlocked ? undefined : true}
            aria-hidden={interactionBlocked || undefined}
            aria-label={labels.endAria}
            inert={interactionBlocked}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <section className="player-menu-card">
              <p className="player-eyebrow">{labels.endEyebrow}</p>
              <h2>{labels.endTitle}</h2>
              <button type="button" onClick={onRestart}>
                {allLabels.common.restart}
              </button>
              {canOpenGame ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={openingGame}
                  onClick={onOpenGame}
                >
                  {openingGame
                    ? allLabels.common.openingGame
                    : allLabels.common.openOtherGame}
                </button>
              ) : null}
              <button
                type="button"
                className="secondary"
                onClick={onReturnToTitle}
              >
                {allLabels.common.returnToTitle}
              </button>
            </section>
          </div>
        ) : null}

        {runtime.status === 'runtimeError' ? (
          <div
            className="player-menu-layer"
            role="alertdialog"
            aria-modal={interactionBlocked ? undefined : true}
            aria-hidden={interactionBlocked || undefined}
            aria-label={labels.runtimeErrorAria}
            inert={interactionBlocked}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <section className="player-menu-card player-error-card">
              <p className="player-eyebrow">{labels.runtimeErrorEyebrow}</p>
              <h2>{labels.runtimeErrorTitle}</h2>
              <p>{runtimeErrorMessage}</p>
              <button type="button" onClick={onRestart}>
                {allLabels.common.restart}
              </button>
              {canOpenGame ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={openingGame}
                  onClick={onOpenGame}
                >
                  {openingGame
                    ? allLabels.common.openingGame
                    : allLabels.common.openOtherGame}
                </button>
              ) : null}
              <button
                type="button"
                className="secondary"
                onClick={onReturnToTitle}
              >
                {allLabels.common.returnToTitle}
              </button>
            </section>
          </div>
        ) : null}
      </VisualStage>

      {!paused &&
      runtime.status !== 'finished' &&
      runtime.status !== 'runtimeError' ? (
        <>
          {!interactionBlocked ? (
            <button
              type="button"
              className="player-pause-button"
              aria-label={labels.pauseAria}
              title={labels.pauseTitle}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={onPause}
            >
              <span aria-hidden="true">Ⅱ</span>
            </button>
          ) : null}
          <GameActionBar
            disabled={interactionBlocked}
            fastForwardActive={fastForwardActive}
            quickSaveBusy={quickSaveBusy}
            quickLoadBusy={quickLoadBusy}
            onSave={onSave}
            onLoad={onLoad}
            onQuickSave={onQuickSave}
            onQuickLoad={onQuickLoad}
            onToggleFastForward={() => {
              if (!interactionBlocked && !paused) {
                if (fastForwardActive) {
                  setFastForwardLatched(false);
                  stopSpaceHold();
                } else {
                  setFastForwardLatched(true);
                }
              }
            }}
            onOptions={onOptions}
            onReturnToTitle={onReturnToTitle}
          />
        </>
      ) : null}
    </main>
  );
}
