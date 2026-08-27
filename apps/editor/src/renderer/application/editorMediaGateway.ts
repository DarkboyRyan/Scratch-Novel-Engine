/**
 * 文件主要作用：为 Renderer 提供受平台网关约束的媒体 URL 解析能力。
 * 包含实现：`resolveEditorMediaUrl`、`resolveEditorAssetPreviewUrl`。
 */

import { getEditorPlatformGateway } from './editorPlatformGateway';
import type {
  AssetPreviewUrlResolver,
  MediaUrlResolver,
} from './mediaPort';

// Platform adapter for the Editor. Shared preview/player UI receives this
// resolver through props and never reaches into the Electron global itself.
export const resolveEditorMediaUrl: MediaUrlResolver = (assetId) =>
  getEditorPlatformGateway().assets.getMediaUrl(assetId);

export const resolveEditorAssetPreviewUrl: AssetPreviewUrlResolver = (
  assetId,
) => getEditorPlatformGateway().assets.getPreviewUrl(assetId);
