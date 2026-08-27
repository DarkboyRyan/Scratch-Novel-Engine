// 主要作用：声明 Preload 通过 contextBridge 暴露到 Renderer 的全局 API。
// 关键实现：扩展 Window，聚合资产、引擎、设置、导出和项目文件接口。
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
