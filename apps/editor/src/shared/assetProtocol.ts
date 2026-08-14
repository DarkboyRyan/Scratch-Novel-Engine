import type { EngineMutationResult } from './engineProtocol';

export const ASSET_IPC_CHANNEL = 'vn-assets:request';

// Renderer can request an import, but it cannot select or construct any host
// path. Electron Main owns both the native source path and project file path.
export type AssetInvocation =
  | {
      action: 'import-image';
      params: Record<string, never>;
    }
  | {
      action: 'import-video';
      params: Record<string, never>;
    }
  | {
      action: 'get-preview-url';
      params: {
        assetId: string;
      };
    };

export type ImportAssetResult =
  | {
      status: 'imported';
      result: EngineMutationResult;
    }
  | {
      status: 'cancelled';
    };

export type ImportImageResult = ImportAssetResult;
export type ImportVideoResult = ImportAssetResult;

export type AssetResponse = ImportAssetResult | string | null;

export type VnAssetsApi = {
  importImage(): Promise<ImportImageResult>;
  importVideo(): Promise<ImportVideoResult>;
  // The URL is an opaque, window-local capability. It never contains a host
  // path and becomes unusable when the window changes to another project.
  getPreviewUrl(assetId: string): Promise<string | null>;
};
