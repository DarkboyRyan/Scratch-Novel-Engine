/**
 * 文件主要作用：组合场景预览舞台、播放器状态与预览控制提示。
 * 包含实现：`PreviewPanel`。
 */

import {
  VisualStage,
  type PreviewCharacter,
} from './VisualStage';
import { useEditorLabels } from '../i18n/editorLocalization';

type PreviewPanelProps = {
  speaker: string;
  text: string;
  backgroundUrl: string | null;
  backgroundName: string | null;
  showDialogue?: boolean;
  logicPreviewUncertain?: boolean;
  cgPreviewUncertain?: boolean;
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
  logicPreviewUncertain = false,
  cgPreviewUncertain = false,
  characters = [],
  isStartDisabled = false,
  onStartPreview,
}: PreviewPanelProps) {
  const labels = useEditorLabels();
  return (
    <main className="preview-panel">
      {onStartPreview ? (
        <div className="preview-toolbar" aria-label={labels.preview.controls}>
          <button
            type="button"
            className="preview-play-button"
            aria-label={labels.preview.start}
            title={labels.preview.start}
            disabled={isStartDisabled}
            onClick={onStartPreview}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
      ) : null}

      {logicPreviewUncertain ? (
        <p className="preview-logic-notice" role="note">
          {labels.preview.logicPreviewUncertain}
        </p>
      ) : null}
      {cgPreviewUncertain ? (
        <p className="preview-logic-notice" role="note">
          {labels.preview.cgPreviewUncertain}
        </p>
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
