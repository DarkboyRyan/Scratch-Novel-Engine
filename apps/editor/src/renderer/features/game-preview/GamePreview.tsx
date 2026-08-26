import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TitleScreen } from '@vnengine/player-ui';
import { getLocalizedRuntimeErrorMessage } from '@vnengine/runtime';

import type { AssetDocument } from '../../../shared/projectTypes';
import type { MediaUrlResolver } from '../../application/mediaPort';
import { VisualStage, type PreviewCharacter } from '../../components/VisualStage';
import { getGamePreviewChoices } from './previewRuntime';
import type { GamePreviewSession } from './useGamePreview';
import { usePreviewAudio } from './usePreviewAudio';
import { PreviewVideo } from './PreviewVideo';
import {
  useEditorLabels,
  useEditorLanguage,
} from '../../i18n/editorLocalization';

type GamePreviewProps = {
  session: GamePreviewSession;
  assets: AssetDocument[];
  previewUrls: Readonly<Record<string, string>>;
  resolveMediaUrl: MediaUrlResolver;
  onAdvance: () => void;
  onVideoComplete: () => void;
  onChoiceSelect: (optionId: string) => void;
  onEnterStory: () => void;
  onExit: () => void;
};

type StoryGamePreviewProps = Omit<GamePreviewProps, 'onEnterStory'>;

function StoryGamePreview({
  session,
  assets,
  previewUrls,
  resolveMediaUrl,
  onAdvance,
  onVideoComplete,
  onChoiceSelect,
  onExit,
}: StoryGamePreviewProps) {
  const labels = useEditorLabels();
  const language = useEditorLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const { runtime } = session;
  const choices = getGamePreviewChoices(session.project, runtime);
  usePreviewAudio(runtime, resolveMediaUrl);
  const backgroundAsset = runtime.backgroundAssetId
    ? assets.find((asset) => asset.id === runtime.backgroundAssetId) ?? null
    : null;
  const characters: PreviewCharacter[] = runtime.characters.map(
    (character) => {
      const asset = assets.find((item) => item.id === character.assetId);
      return {
        id: character.nodeId,
        url: previewUrls[character.assetId] ?? null,
        name: asset?.displayName ?? labels.preview.missingPortrait,
        slot: character.slot,
        layer: character.layer,
        position: character.position,
      };
    },
  );

  useEffect(() => {
    rootRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
        return;
      }

      if (
        event.repeat ||
        (event.target instanceof Element && event.target.closest('button'))
      ) {
        return;
      }

      if (runtime.status === 'playingVideo' && event.key === 'Enter') {
        event.preventDefault();
        onVideoComplete();
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
  }, [onAdvance, onExit, onVideoComplete, runtime.status]);

  return (
    <div
      ref={rootRef}
      className="game-preview-overlay"
      tabIndex={-1}
      aria-label={labels.preview.gamePreview}
      onPointerUp={(event) => {
        if (event.button === 0 && runtime.status === 'playing') {
          onAdvance();
        }
      }}
    >
      <VisualStage
        className="game-preview-stage"
        speaker={runtime.dialogue?.speaker ?? ''}
        text={runtime.dialogue?.text ?? ''}
        backgroundUrl={
          backgroundAsset ? previewUrls[backgroundAsset.id] ?? null : null
        }
        backgroundName={backgroundAsset?.displayName ?? null}
        showDialogue={runtime.status === 'playing' && runtime.dialogue !== null}
        characters={characters}
        placeholder={labels.preview.gamePreview}
      >
        {runtime.status === 'finished' ? (
          <div className="game-preview-finished" role="status">
            <strong>{labels.preview.finished}</strong>
            <span>{labels.preview.finishedHelp}</span>
          </div>
        ) : null}
        {runtime.status === 'runtimeError' ? (
          <div className="game-preview-finished game-preview-error" role="alert">
            <strong>{labels.preview.cannotContinue}</strong>
            <span>
              {getLocalizedRuntimeErrorMessage(
                runtime,
                language,
                labels.preview.runtimeErrorFallback,
              )}
            </span>
          </div>
        ) : null}
        {runtime.status === 'playingVideo' && runtime.videoAssetId ? (
          <PreviewVideo
            assetId={runtime.videoAssetId}
            sequence={runtime.videoSequence}
            resolveMediaUrl={resolveMediaUrl}
            onComplete={onVideoComplete}
          />
        ) : null}
        {runtime.status === 'choosing' ? (
          <div className="game-preview-choice-layer">
            <div
              className="game-preview-choice-list"
              role="group"
              aria-label={labels.preview.chooseAction}
            >
              {choices.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="game-preview-choice-button"
                  onClick={() => onChoiceSelect(option.id)}
                >
                  {option.text || labels.common.unnamedOption}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </VisualStage>

      <button
        type="button"
        className="game-preview-exit"
        aria-label={labels.preview.exit}
        title={labels.preview.exitWithEscape}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={onExit}
      >
        ×
      </button>
    </div>
  );
}

type TitleGamePreviewProps = Pick<
  GamePreviewProps,
  'session' | 'resolveMediaUrl' | 'onEnterStory' | 'onExit'
>;

function TitleGamePreview({
  session,
  resolveMediaUrl,
  onEnterStory,
  onExit,
}: TitleGamePreviewProps) {
  const labels = useEditorLabels();
  const language = useEditorLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const loadNoticeRef = useRef<HTMLDivElement>(null);
  const loadNoticeTriggerRef = useRef<HTMLElement | null>(null);
  const [loadPreviewNoticeOpen, setLoadPreviewNoticeOpen] = useState(false);

  useLayoutEffect(() => {
    if (!loadPreviewNoticeOpen) {
      return;
    }
    const notice = loadNoticeRef.current;
    const dismissButton = notice?.querySelector<HTMLButtonElement>('button');
    (dismissButton ?? notice)?.focus();
    return () => {
      queueMicrotask(() => {
        const trigger = loadNoticeTriggerRef.current;
        if (
          trigger?.isConnected
          && !trigger.matches(':disabled')
          && trigger.closest('[inert]') === null
        ) {
          trigger.focus();
        }
      });
    };
  }, [loadPreviewNoticeOpen]);

  useEffect(() => {
    if (!loadPreviewNoticeOpen) {
      rootRef.current?.focus();
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loadPreviewNoticeOpen && event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const dismissButton = loadNoticeRef.current
          ?.querySelector<HTMLButtonElement>('button');
        (dismissButton ?? loadNoticeRef.current)?.focus();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (loadPreviewNoticeOpen) {
          setLoadPreviewNoticeOpen(false);
        } else {
          onExit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadPreviewNoticeOpen, onExit]);

  return (
    <div
      ref={rootRef}
      className="game-preview-overlay game-preview-title-overlay"
      tabIndex={-1}
      aria-label={labels.preview.fullTitlePreview}
    >
      <TitleScreen
        language={language}
        startScreen={session.project.startScreen}
        cgGalleryPages={session.project.cgGallery?.pages ?? []}
        resolveMediaUrl={resolveMediaUrl}
        interactionBlocked={loadPreviewNoticeOpen}
        onStart={onEnterStory}
        onLoadGame={() => {
          loadNoticeTriggerRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
          setLoadPreviewNoticeOpen(true);
        }}
        onExit={onExit}
      />
      {loadPreviewNoticeOpen ? (
        <div
          ref={loadNoticeRef}
          className="player-menu-layer"
          role="dialog"
          aria-modal="true"
          aria-label={labels.preview.loadNotice}
          tabIndex={-1}
        >
          <section className="player-menu-card">
            <p className="player-eyebrow">EDITOR PREVIEW</p>
            <h2>{labels.preview.loadGame}</h2>
            <p className="game-preview-load-note">{labels.preview.loadHelp}</p>
            <button
              type="button"
              onClick={() => setLoadPreviewNoticeOpen(false)}
            >
              {labels.preview.understood}
            </button>
          </section>
        </div>
      ) : null}
      <button
        type="button"
        className="game-preview-exit"
        aria-label={labels.preview.exit}
        title={labels.preview.exitWithEscape}
        disabled={loadPreviewNoticeOpen}
        aria-hidden={loadPreviewNoticeOpen || undefined}
        onClick={onExit}
      >
        ×
      </button>
    </div>
  );
}

export function GamePreview(props: GamePreviewProps) {
  return props.session.phase === 'title' ? (
    <TitleGamePreview
      session={props.session}
      resolveMediaUrl={props.resolveMediaUrl}
      onEnterStory={props.onEnterStory}
      onExit={props.onExit}
    />
  ) : (
    <StoryGamePreview
      session={props.session}
      assets={props.assets}
      previewUrls={props.previewUrls}
      resolveMediaUrl={props.resolveMediaUrl}
      onAdvance={props.onAdvance}
      onVideoComplete={props.onVideoComplete}
      onChoiceSelect={props.onChoiceSelect}
      onExit={props.onExit}
    />
  );
}
