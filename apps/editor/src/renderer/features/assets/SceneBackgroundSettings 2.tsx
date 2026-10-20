/**
 * 文件主要作用：在 Blockly 界面中编辑场景初始背景与缩放。
 * 包含实现：`SceneBackgroundSettings`、`SceneBackgroundSelection`。
 */

import { useId } from 'react';

import type { AssetDocument } from '../../../shared/projectTypes';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isImageScalePercent,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
} from '../../../shared/projectTypes';
import { useEditorLabels } from '../../i18n/editorLocalization';

export type SceneBackgroundSelection = {
  assetId: string | null;
  scalePercent: number;
};

export type SceneBackgroundSettingsProps = {
  assets: AssetDocument[];
  backgroundAssetId: string | null;
  backgroundScalePercent: number;
  backgroundScaleDraft: string;
  backgroundScaleDraftInvalid: boolean;
  isBusy: boolean;
  variant?: 'panel' | 'inline';
  onBackgroundScaleDraftChange: (value: string) => void;
  onCommitBackgroundScaleDraft: () => Promise<boolean>;
  onSelectBackground: (next: SceneBackgroundSelection) => Promise<void>;
};

export function SceneBackgroundSettings({
  assets,
  backgroundAssetId,
  backgroundScalePercent,
  backgroundScaleDraft,
  backgroundScaleDraftInvalid,
  isBusy,
  variant = 'panel',
  onBackgroundScaleDraftChange,
  onCommitBackgroundScaleDraft,
  onSelectBackground,
}: SceneBackgroundSettingsProps) {
  const labels = useEditorLabels();
  const titleId = useId();
  const errorId = useId();
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const selectedImageExists =
    backgroundAssetId === null ||
    imageAssets.some((asset) => asset.id === backgroundAssetId);

  return (
    <div
      className={`scene-background-settings scene-background-settings-${variant}`}
      role="group"
      aria-labelledby={titleId}
    >
      <strong id={titleId}>{labels.scenes.background}</strong>

      <select
        className="scene-select scene-background-select"
        value={backgroundAssetId ?? ''}
        disabled={isBusy}
        aria-label={labels.scenes.background}
        onChange={(event) => {
          const assetId = event.currentTarget.value || null;
          if (assetId === backgroundAssetId) {
            return;
          }
          const draftScalePercent = Number(backgroundScaleDraft);
          void onSelectBackground({
            assetId,
            scalePercent:
              assetId === null || backgroundAssetId === null
                ? DEFAULT_IMAGE_SCALE_PERCENT
                : isImageScalePercent(draftScalePercent)
                  ? draftScalePercent
                  : backgroundScalePercent,
          });
        }}
      >
        <option value="">{labels.resource.noBackground}</option>
        {imageAssets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.displayName}
          </option>
        ))}
        {!selectedImageExists && backgroundAssetId !== null ? (
          <option value={backgroundAssetId}>
            {labels.common.missingImage} ({backgroundAssetId})
          </option>
        ) : null}
      </select>

      <label className="resource-background-scale scene-background-scale">
        <span>{labels.inspector.scale}</span>
        <input
          type="number"
          min={MIN_IMAGE_SCALE_PERCENT}
          max={MAX_IMAGE_SCALE_PERCENT}
          step="1"
          value={backgroundScaleDraft}
          disabled={isBusy || backgroundAssetId === null}
          aria-label={labels.inspector.backgroundScaleAria}
          aria-invalid={backgroundScaleDraftInvalid || undefined}
          aria-describedby={backgroundScaleDraftInvalid ? errorId : undefined}
          onChange={(event) =>
            onBackgroundScaleDraftChange(event.currentTarget.value)
          }
          onBlur={(event) => {
            // A mutating click owns the shared prepare boundary. Let it run
            // before Engine busy state disables its target.
            if (event.relatedTarget === null) {
              void onCommitBackgroundScaleDraft();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void onCommitBackgroundScaleDraft();
            }
          }}
        />
        <span aria-hidden="true">%</span>
      </label>

      {backgroundScaleDraftInvalid ? (
        <span
          id={errorId}
          className="resource-background-scale-error"
          role="alert"
        >
          {labels.inspector.scaleInvalid}
        </span>
      ) : null}
    </div>
  );
}
