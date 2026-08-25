import type { VnAssetsApi } from './assetProtocol';
import type { VnEngineApi } from './engineProtocol';
import type { VnEditorSettingsApi } from './editorSettingsProtocol';
import type { VnGameExportApi } from './exportProtocol';
import type { VnProjectFilesApi } from './projectFileProtocol';

declare global {
  interface Window {
    readonly vnAssets: VnAssetsApi;
    readonly vnEngine: VnEngineApi;
    readonly vnEditorSettings: VnEditorSettingsApi;
    readonly vnGameExport: VnGameExportApi;
    readonly vnProjectFiles: VnProjectFilesApi;
  }
}

export {};
