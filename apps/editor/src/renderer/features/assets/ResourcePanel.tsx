import type { AssetDocument } from '../../../shared/projectTypes';
import {
  VN_AUDIO_ASSET_DRAG_TYPE,
  VN_IMAGE_ASSET_DRAG_TYPE,
  VN_VIDEO_ASSET_DRAG_TYPE,
} from './assetDragTypes';

type ResourcePanelProps = {
  assets: AssetDocument[];
  backgroundAssetId: string | null;
  previewUrls: Readonly<Record<string, string>>;
  isBusy: boolean;
  imageSelectionPurpose?: 'background' | 'cg-gallery';
  onImportImage: () => Promise<void>;
  onImportAudio: () => Promise<void>;
  onImportVideo: () => Promise<void>;
  onSelectBackground: (assetId: string | null) => Promise<void>;
};

export function ResourcePanel({
  assets,
  backgroundAssetId,
  previewUrls,
  isBusy,
  imageSelectionPurpose = 'background',
  onImportImage,
  onImportAudio,
  onImportVideo,
  onSelectBackground,
}: ResourcePanelProps) {
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const videoAssets = assets.filter((asset) => asset.type === 'video');
  const audioAssets = assets.filter((asset) => asset.type === 'audio');

  return (
    <section className="resource-panel" aria-labelledby="resource-title">
      <div className="resource-panel-heading">
        <strong id="resource-title">项目资源</strong>
        <span>{assets.length} 项</span>
      </div>

      <button
        type="button"
        className="resource-import-button"
        disabled={isBusy}
        onClick={() => void onImportImage()}
      >
        导入图片
      </button>

      <button
        type="button"
        className="resource-import-button resource-import-audio-button"
        disabled={isBusy}
        onClick={() => void onImportAudio()}
      >
        导入音频
      </button>

      <button
        type="button"
        className="resource-import-button resource-import-video-button"
        disabled={isBusy}
        onClick={() => void onImportVideo()}
      >
        导入视频
      </button>

      {imageSelectionPurpose === 'background' ? (
        <button
          type="button"
          className="resource-clear-background"
          aria-pressed={backgroundAssetId === null}
          disabled={isBusy || backgroundAssetId === null}
          onClick={() => void onSelectBackground(null)}
        >
          无背景
        </button>
      ) : null}

      <div className="resource-list" aria-label="已导入资源">
        {assets.length === 0 ? (
          <span className="resource-empty">
            暂无资源。可导入图片、音频和视频。
          </span>
        ) : (
          <>
            {imageAssets.length > 0 ? (
              <div className="resource-group" aria-label="图片资源">
                <span className="resource-group-label">图片</span>
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
                        : `将 ${asset.displayName} 设为当前场景背景`
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
                        void onSelectBackground(asset.id);
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
                        图
                      </span>
                    )}
                    <span>{asset.displayName}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {audioAssets.length > 0 ? (
              <div className="resource-group" aria-label="音频资源">
                <span className="resource-group-label">音频</span>
                {audioAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable={!isBusy}
                    className="resource-item resource-audio-item"
                    title={`拖到对白语音或背景音乐积木：${asset.displayName}`}
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
              <div className="resource-group" aria-label="视频资源">
                <span className="resource-group-label">视频</span>
                {videoAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable={!isBusy}
                    className="resource-item resource-video-item"
                    title={`拖到视频播放积木：${asset.displayName}`}
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
