// 主要作用：定义 Renderer、Preload 与 Main 之间的资产 IPC 契约。
// 关键实现：声明导入、预览和资源管理动作及 window.vnAssets API。
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
      action: 'import-audio';
      params: Record<string, never>;
    }
  | {
      action: 'get-preview-url';
      params: {
        assetId: string;
      };
    }
  | {
      action: 'get-media-url';
      params: {
        assetId: string;
      };
    }
  | {
      action: 'rename';
      params: {
        assetId: string;
        displayName: string;
      };
    }
  | {
      action: 'delete-many';
      params: {
        assetIds: string[];
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
export type ImportAudioResult = ImportAssetResult;

export type AssetResponse =
  | ImportAssetResult
  | EngineMutationResult
  | string
  | null;

export type VnAssetsApi = {
  // Renderer must not call the management methods when an older live Preload
  // is still attached after HMR. That process does not own their IPC shape.
  readonly managementContractVersion?: 1;
  importImage(): Promise<ImportImageResult>;
  importVideo(): Promise<ImportVideoResult>;
  importAudio(): Promise<ImportAudioResult>;
  // The URL is an opaque, window-local capability. It never contains a host
  // path and becomes unusable when the window changes to another project.
  getPreviewUrl(assetId: string): Promise<string | null>;
  getMediaUrl(assetId: string): Promise<string | null>;
  renameAsset(
    assetId: string,
    displayName: string,
  ): Promise<EngineMutationResult>;
  deleteAssets(assetIds: string[]): Promise<EngineMutationResult>;
};
