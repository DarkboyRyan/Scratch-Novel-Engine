import type { VnAssetsApi } from './assetProtocol';
import type { VnEngineApi } from './engineProtocol';
import type { VnProjectFilesApi } from './projectFileProtocol';

declare global {
  interface Window {
    readonly vnAssets: VnAssetsApi;
    readonly vnEngine: VnEngineApi;
    readonly vnProjectFiles: VnProjectFilesApi;
  }
}

export {};
