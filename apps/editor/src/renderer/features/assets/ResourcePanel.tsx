/**
 * 文件主要作用：展示项目资源并支持导入、预览、拖拽及场景初始背景缩放。
 * 包含实现：`ResourcePanel`。
 */

import type { AssetDocument } from '../../../shared/projectTypes';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isImageScalePercent,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
} from '../../../shared/projectTypes';
import {
  VN_AUDIO_ASSET_DRAG_TYPE,
  VN_IMAGE_ASSET_DRAG_TYPE,
  VN_VIDEO_ASSET_DRAG_TYPE,
} from './assetDragTypes';
import { useEditorLabels } from '../../i18n/editorLocalization';

type ResourcePanelProps = {
  assets: AssetDocument[];
  backgroundAssetId: string | null;
  backgroundScalePercent: number;
  backgroundScaleDraft: string;
  backgroundScaleDraftInvalid: boolean;
  supportsBackgroundScale: boolean;
  previewUrls: Readonly<Record<string, string>>;
  isBusy: boolean;
  imageSelectionPurpose?: 'background' | 'cg-gallery';
  onImportImage: () => Promise<void>;
  onImportAudio: () => Promise<void>;
  onImportVideo: () => Promise<void>;
  onBackgroundScaleDraftChange: (value: string) => void;
  onCommitBackgroundScaleDraft: () => Promise<boolean>;
  onSelectBackground: (next: {
    assetId: string | null;
    scalePercent: number;
  }) => Promise<void>;
};

export function ResourcePanel({
  assets,
  backgroundAssetId,
  backgroundScalePercent,
  backgroundScaleDraft,
  backgroundScaleDraftInvalid,
  supportsBackgroundScale,
  previewUrls,
  isBusy,
  imageSelectionPurpose = 'background',
  onImportImage,
  onImportAudio,
  onImportVideo,
  onBackgroundScaleDraftChange,
  onCommitBackgroundScaleDraft,
  onSelectBackground,
}: ResourcePanelProps) {
  const labels = useEditorLabels();
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const videoAssets = assets.filter((asset) => asset.type === 'video');
  const audioAssets = assets.filter((asset) => asset.type === 'audio');

  return (
    <section className="resource-panel" aria-labelledby="resource-title">
      <div className="resource-panel-heading">
        <strong id="resource-title">{labels.resource.title}</strong>
        <span>{assets.length} {labels.resource.itemUnit}</span>
      </div>

      <button
        type="button"
        className="resource-import-button"
        disabled={isBusy}
        onClick={() => void onImportImage()}
      >
        {labels.resource.importImage}
      </button>

      <button
        type="button"
        className="resource-import-button resource-import-audio-button"
        disabled={isBusy}
        onClick={() => void onImportAudio()}
      >
        {labels.resource.importAudio}
      </button>

      <button
        type="button"
        className="resource-import-button resource-import-video-button"
        disabled={isBusy}
        onClick={() => void onImportVideo()}
      >
        {labels.resource.importVideo}
      </button>

      {imageSelectionPurpose === 'background' ? (
        <>
          <button
            type="button"
            className="resource-clear-background"
            aria-pressed={backgroundAssetId === null}
            disabled={isBusy || backgroundAssetId === null}
            onClick={() =>
              void onSelectBackground({
                assetId: null,
                scalePercent: DEFAULT_IMAGE_SCALE_PERCENT,
              })
            }
          >
            {labels.resource.noBackground}
          </button>
          {supportsBackgroundScale ? (
            <label className="resource-background-scale">
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
                aria-describedby={
                  backgroundScaleDraftInvalid
                    ? 'resource-background-scale-error'
                    : undefined
                }
                onChange={(event) =>
                  onBackgroundScaleDraftChange(event.currentTarget.value)
                }
                onBlur={(event) => {
                  // Mutating click targets call the shared prepare boundary.
                  // Let that click run before Engine busy state disables it.
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
              {backgroundScaleDraftInvalid ? (
                <span
                  id="resource-background-scale-error"
                  className="resource-background-scale-error"
                  role="alert"
                >
                  {labels.inspector.scaleInvalid}
                </span>
              ) : null}
            </label>
          ) : null}
        </>
      ) : null}

      <div className="resource-list" aria-label={labels.resource.importedAssets}>
        {assets.length === 0 ? (
          <span className="resource-empty">
            {labels.resource.empty}
          </span>
        ) : (
          <>
            {imageAssets.length > 0 ? (
              <div className="resource-group" aria-label={labels.resource.imageAssets}>
                <span className="resource-group-label">{labels.common.image}</span>
                {imageAssets.map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    draggable={
                      !isBusy && imageSelectionPurpose === 'background'
                    }
                    className={`resource-item${
                      asset.id === backgroundAssetId
                        ? ' is-background'
                        : ''
                    }`}
                    title={
                      imageSelectionPurpose === 'cg-gallery'
                        ? asset.displayName
                        : `${labels.resource.setSceneBackgroundPrefix}${asset.displayName}`
                    }
                    aria-pressed={
                      imageSelectionPurpose === 'background'
                        ? asset.id === backgroundAssetId
                        : undefined
                    }
                    disabled={
                      isBusy || imageSelectionPurpose === 'cg-gallery'
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData(
                        VN_IMAGE_ASSET_DRAG_TYPE,
                        asset.id,
                      );
                    }}
                    onClick={() => {
                      if (imageSelectionPurpose === 'background') {
                        void onSelectBackground({
                          assetId: asset.id,
                          scalePercent: (() => {
                            if (backgroundAssetId === null) {
                              return DEFAULT_IMAGE_SCALE_PERCENT;
                            }
                            const draftScalePercent = Number(
                              backgroundScaleDraft,
                            );
                            return isImageScalePercent(draftScalePercent)
                              ? draftScalePercent
                              : backgroundScalePercent;
                          })(),
                        });
                      }
                    }}
                  >
                    {previewUrls[asset.id] ? (
                      <img
                        className="resource-thumbnail"
                        src={previewUrls[asset.id]}
                        alt=""
                      />
                    ) : (
                      <span
                        className="resource-thumbnail-placeholder"
                        aria-hidden="true"
                      >
                        {labels.resource.imagePlaceholder}
                      </span>
                    )}
                    <span>{asset.displayName}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {audioAssets.length > 0 ? (
              <div className="resource-group" aria-label={labels.resource.audioAssets}>
                <span className="resource-group-label">{labels.common.audio}</span>
                {audioAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable={!isBusy}
                    className="resource-item resource-audio-item"
                    title={`${labels.resource.dragAudioPrefix}${asset.displayName}`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData(
                        VN_AUDIO_ASSET_DRAG_TYPE,
                        asset.id,
                      );
                    }}
                  >
                    <span
                      className="resource-thumbnail-placeholder resource-audio-icon"
                      aria-hidden="true"
                    >
                      ♫
                    </span>
                    <span>{asset.displayName}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {videoAssets.length > 0 ? (
              <div className="resource-group" aria-label={labels.resource.videoAssets}>
                <span className="resource-group-label">{labels.common.video}</span>
                {videoAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable={!isBusy}
                    className="resource-item resource-video-item"
                    title={`${labels.resource.dragVideoPrefix}${asset.displayName}`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData(
                        VN_VIDEO_ASSET_DRAG_TYPE,
                        asset.id,
                      );
                    }}
                  >
                    <span
                      className="resource-thumbnail-placeholder resource-video-icon"
                      aria-hidden="true"
                    >
                      ▶
                    </span>
                    <span>{asset.displayName}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
