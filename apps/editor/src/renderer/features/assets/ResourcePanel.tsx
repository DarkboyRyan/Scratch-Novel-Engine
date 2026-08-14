import type { AssetDocument } from '../../../shared/projectTypes';

export const VN_IMAGE_ASSET_DRAG_TYPE =
  'application/x-vn-image-asset-id';

type ResourcePanelProps = {
  assets: AssetDocument[];
  backgroundAssetId: string | null;
  previewUrls: Readonly<Record<string, string>>;
  isBusy: boolean;
  onImportImage: () => Promise<void>;
  onImportVideo: () => Promise<void>;
  onSelectBackground: (assetId: string | null) => Promise<void>;
};

export function ResourcePanel({
  assets,
  backgroundAssetId,
  previewUrls,
  isBusy,
  onImportImage,
  onImportVideo,
  onSelectBackground,
}: ResourcePanelProps) {
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const videoAssets = assets.filter((asset) => asset.type === 'video');

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
        className="resource-import-button resource-import-video-button"
        disabled={isBusy}
        onClick={() => void onImportVideo()}
      >
        导入视频
      </button>

      <button
        type="button"
        className="resource-clear-background"
        aria-pressed={backgroundAssetId === null}
        disabled={isBusy || backgroundAssetId === null}
        onClick={() => void onSelectBackground(null)}
      >
        无背景
      </button>

      <div className="resource-list" aria-label="已导入资源">
        {assets.length === 0 ? (
          <span className="resource-empty">
            暂无资源。图片支持 PNG、JPEG、WebP；视频支持 MP4、WebM。
          </span>
        ) : (
          <>
            {imageAssets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                draggable={!isBusy}
                className={`resource-item${
                  asset.id === backgroundAssetId
                    ? ' is-background'
                    : ''
                }`}
                title={`将 ${asset.displayName} 设为当前场景背景`}
                aria-pressed={asset.id === backgroundAssetId}
                disabled={isBusy}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData(
                    VN_IMAGE_ASSET_DRAG_TYPE,
                    asset.id,
                  );
                  event.dataTransfer.setData('text/plain', asset.id);
                }}
                onClick={() => void onSelectBackground(asset.id)}
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
            {videoAssets.map((asset) => (
              <div
                key={asset.id}
                className="resource-item resource-video-item"
                title={asset.displayName}
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
          </>
        )}
      </div>
    </section>
  );
}
