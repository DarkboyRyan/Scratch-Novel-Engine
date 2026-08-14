import {
  VisualStage,
  type PreviewCharacter,
} from './VisualStage';

type PreviewPanelProps = {
  speaker: string;
  text: string;
  backgroundUrl: string | null;
  backgroundName: string | null;
  showDialogue?: boolean;
  characters?: PreviewCharacter[];
  isStartDisabled?: boolean;
  onStartPreview?: () => void;
};

export type { PreviewCharacter } from './VisualStage';

export function PreviewPanel({
  speaker,
  text,
  backgroundUrl,
  backgroundName,
  showDialogue = true,
  characters = [],
  isStartDisabled = false,
  onStartPreview,
}: PreviewPanelProps) {
  return (
    <main className="preview-panel">
      {onStartPreview ? (
        <div className="preview-toolbar" aria-label="游戏预览控制">
          <button
            type="button"
            className="preview-play-button"
            aria-label="开始游戏预览"
            title="开始游戏预览"
            disabled={isStartDisabled}
            onClick={onStartPreview}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
      ) : null}

      <VisualStage
        speaker={speaker}
        text={text}
        backgroundUrl={backgroundUrl}
        backgroundName={backgroundName}
        showDialogue={showDialogue}
        characters={characters}
      />
    </main>
  );
}
