import type { AssetDocument } from '../../../shared/projectTypes';

type ResourcePanelProps = {
  assets: AssetDocument[];
  backgroundAssetId: string | null;
  previewUrls: Readonly<Record<string, string>>;
  isBusy: boolean;
  onImportImage: () => Promise<void>;
  onSelectBackground: (assetId: string | null) => Promise<void>;
};

export function ResourcePanel({
  assets,
  backgroundAssetId,
  previewUrls,
  isBusy,
  onImportImage,
  onSelectBackground,
}: ResourcePanelProps) {
  const imageAssets = assets.filter((asset) => asset.type === 'image');

  return (
    <section className="resource-panel" aria-labelledby="resource-title">
      <div className="resource-panel-heading">
        <strong id="resource-title">图片资源</strong>
        <span>{imageAssets.length} 项</span>
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
        className="resource-clear-background"
        aria-pressed={backgroundAssetId === null}
        disabled={isBusy || backgroundAssetId === null}
        onClick={() => void onSelectBackground(null)}
      >
        无背景
      </button>

      <div className="resource-list" aria-label="已导入图片">
        {imageAssets.length === 0 ? (
          <span className="resource-empty">
            暂无图片。支持 PNG、JPEG 和 WebP。
          </span>
        ) : (
          imageAssets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className={`resource-item${
                asset.id === backgroundAssetId
                  ? ' is-background'
                  : ''
              }`}
              title={`将 ${asset.displayName} 设为当前场景背景`}
              aria-pressed={asset.id === backgroundAssetId}
              disabled={isBusy}
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
          ))
        )}
      </div>
    </section>
  );
}
