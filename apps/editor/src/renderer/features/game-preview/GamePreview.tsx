import { useEffect, useRef } from 'react';

import type { AssetDocument } from '../../../shared/projectTypes';
import type { MediaUrlResolver } from '../../application/mediaPort';
import { VisualStage, type PreviewCharacter } from '../../components/VisualStage';
import { getGamePreviewChoices } from './previewRuntime';
import type { GamePreviewSession } from './useGamePreview';
import { usePreviewAudio } from './usePreviewAudio';
import { PreviewVideo } from './PreviewVideo';

type GamePreviewProps = {
  session: GamePreviewSession;
  assets: AssetDocument[];
  previewUrls: Readonly<Record<string, string>>;
  resolveMediaUrl: MediaUrlResolver;
  onAdvance: () => void;
  onVideoComplete: () => void;
  onChoiceSelect: (optionId: string) => void;
  onExit: () => void;
};

export function GamePreview({
  session,
  assets,
  previewUrls,
  resolveMediaUrl,
  onAdvance,
  onVideoComplete,
  onChoiceSelect,
  onExit,
}: GamePreviewProps) {
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
        name: asset?.displayName ?? '缺失立绘',
        slot: character.slot,
        layer: character.layer,
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
      aria-label="游戏预览"
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
        placeholder="游戏预览"
      >
        {runtime.status === 'finished' ? (
          <div className="game-preview-finished" role="status">
            <strong>预览结束</strong>
            <span>按 Esc 或点击右上角返回编辑器</span>
          </div>
        ) : null}
        {runtime.status === 'runtimeError' ? (
          <div className="game-preview-finished game-preview-error" role="alert">
            <strong>预览无法继续</strong>
            <span>{runtime.errorMessage}</span>
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
              aria-label="请选择接下来的行动"
            >
              {choices.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="game-preview-choice-button"
                  onClick={() => onChoiceSelect(option.id)}
                >
                  {option.text || '未命名选项'}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </VisualStage>

      <button
        type="button"
        className="game-preview-exit"
        aria-label="退出游戏预览"
        title="退出游戏预览（Esc）"
        onPointerUp={(event) => event.stopPropagation()}
        onClick={onExit}
      >
        ×
      </button>
    </div>
  );
}
