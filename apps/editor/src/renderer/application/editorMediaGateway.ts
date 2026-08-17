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
