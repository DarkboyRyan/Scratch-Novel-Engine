import { useEffect, useRef, useState } from 'react';
import type { StartScreenDocument } from '@vnengine/runtime';

import type { PlayerUiLocalizationProps } from './localization';
import type { MediaUrlResolver } from './mediaPort';
import { CgGallery } from './CgGallery';
import {
  effectiveMediaVolume,
} from './mediaVolume';
import {
  OptionsDialog,
  type OptionsSettingsValue,
} from './OptionsDialog';
import { usePlayerUiLocalization } from './PlayerUiProvider';
import { useAutoFitScale } from './useAutoFitScale';

const DEFAULT_PREVIEW_OPTIONS: Omit<OptionsSettingsValue, 'language'> = {
  settingsVersion: 2,
  masterVolume: 1,
  bgmVolume: 1,
  voiceVolume: 1,
  videoVolume: 1,
  windowMode: 'windowed',
  windowSizePreset: 'medium',
};

export type TitleScreenProps = PlayerUiLocalizationProps & {
  startScreen: StartScreenDocument;
  cgGalleryPages?: ReadonlyArray<{
    imageAssetIds: readonly (string | null)[];
  }>;
  resolveMediaUrl: MediaUrlResolver;
  openingGame?: boolean;
  loadingSaveGame?: boolean;
  mediaPaused?: boolean;
  interactionBlocked?: boolean;
  bgmVolume?: number;
  onStart: () => void;
  onLoadGame?: () => void;
  onOpenOptions?: () => void;
  onOpenGame?: () => void;
  onModalStateChange?: (open: boolean) => void;
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
  language,
  labels: labelsOverride,
  startScreen,
  cgGalleryPages = [],
  resolveMediaUrl,
  openingGame = false,
  loadingSaveGame = false,
  mediaPaused = false,
  interactionBlocked = false,
  bgmVolume = 1,
  onStart,
  onLoadGame,
  onOpenOptions,
  onOpenGame,
  onModalStateChange,
  onExit,
}: TitleScreenProps) {
  const inheritedLocalization = usePlayerUiLocalization(
    language,
    labelsOverride,
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [cgGalleryOpen, setCgGalleryOpen] = useState(false);
  const [previewOptions, setPreviewOptions] = useState<OptionsSettingsValue>(
    () => ({
      ...DEFAULT_PREVIEW_OPTIONS,
      language: inheritedLocalization.language,
    }),
  );
  const previewLocalization = usePlayerUiLocalization(
    previewOptions.language,
    labelsOverride?.locale === previewOptions.language
      ? labelsOverride
      : undefined,
  );
  const activeLocalization = onOpenOptions === undefined
    ? previewLocalization
    : inheritedLocalization;
  const labels = activeLocalization.labels.title;
  const audioRef = useRef<HTMLAudioElement>(null);
  const modalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const titleFit = useAutoFitScale<HTMLDivElement, HTMLElement>();
  const backgroundUrl = useResolvedTitleAsset(
    startScreen.backgroundAssetId,
    resolveMediaUrl,
  );
  const musicUrl = useResolvedTitleAsset(
    startScreen.musicAssetId,
    resolveMediaUrl,
  );
  const effectiveBgmVolume = onOpenOptions
    ? effectiveMediaVolume(1, bgmVolume)
    : effectiveMediaVolume(
        previewOptions.masterVolume,
        previewOptions.bgmVolume,
      );
  const titleActionsBlocked =
    interactionBlocked || optionsOpen || cgGalleryOpen;

  useEffect(() => {
    if (audioRef.current !== null) {
      audioRef.current.volume = effectiveBgmVolume;
    }
  }, [effectiveBgmVolume, musicUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null || musicUrl === null || mediaPaused) {
      audio?.pause();
      return;
    }
    audio.loop = true;
    // Browser autoplay policy may reject this promise. The title screen stays
    // interactive; changing a volume control provides another user gesture.
    void audio.play().catch(() => undefined);
  }, [mediaPaused, musicUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (audio) {
        audio.currentTime = 0;
      }
    };
  }, [musicUrl]);

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
      <div
        ref={titleFit.containerRef}
        className="player-title-fit"
        aria-hidden={titleActionsBlocked || undefined}
        inert={titleActionsBlocked}
      >
        <section ref={titleFit.contentRef} className="player-title-card">
          <p className="player-eyebrow">{labels.eyebrow}</p>
          <h1>{startScreen.title || labels.untitledGame}</h1>
          <div className="player-title-actions player-title-actions-vertical">
            <button
              type="button"
              className="player-start-button"
              disabled={titleActionsBlocked}
              onClick={onStart}
            >
              <span aria-hidden="true">▶</span>
              {labels.startGame}
            </button>
            {onLoadGame !== undefined ? (
              <button
                type="button"
                className="secondary"
                disabled={titleActionsBlocked || loadingSaveGame}
                onClick={onLoadGame}
              >
                {loadingSaveGame ? labels.loadingSave : labels.loadGame}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              disabled={titleActionsBlocked}
              onClick={(event) => {
                modalTriggerRef.current = event.currentTarget;
                onModalStateChange?.(true);
                setCgGalleryOpen(true);
              }}
            >
              {labels.cgGallery}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={titleActionsBlocked}
              onClick={(event) => {
                modalTriggerRef.current = event.currentTarget;
                if (onOpenOptions) {
                  onOpenOptions();
                } else {
                  onModalStateChange?.(true);
                  setOptionsOpen(true);
                }
              }}
            >
              {labels.options}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={titleActionsBlocked}
              onClick={onExit}
            >
              {labels.exitGame}
            </button>
          </div>
        </section>
      </div>
      {optionsOpen ? (
        <OptionsDialog
          language={previewOptions.language}
          labels={labelsOverride?.locale === previewOptions.language
            ? labelsOverride
            : undefined}
          settings={previewOptions}
          openingGame={openingGame}
          windowControlsEnabled={false}
          onPreviewSettingsChange={setPreviewOptions}
          onCommitSettings={setPreviewOptions}
          onReset={() => setPreviewOptions({
            ...DEFAULT_PREVIEW_OPTIONS,
            language: inheritedLocalization.language,
          })}
          restoreFocusTo={modalTriggerRef.current}
          onOpenGame={onOpenGame ? () => {
            setOptionsOpen(false);
            onModalStateChange?.(false);
            onOpenGame();
          } : undefined}
          onClose={() => {
            setOptionsOpen(false);
            onModalStateChange?.(false);
          }}
        />
      ) : null}
      {cgGalleryOpen ? (
        <CgGallery
          language={activeLocalization.language}
          labels={labelsOverride?.locale === activeLocalization.language
            ? labelsOverride
            : undefined}
          pages={cgGalleryPages}
          resolveMediaUrl={resolveMediaUrl}
          restoreFocusTo={modalTriggerRef.current}
          onClose={() => {
            setCgGalleryOpen(false);
            onModalStateChange?.(false);
          }}
        />
      ) : null}
    </main>
  );
}
