# 跨进程共享契约

Shared 只包含可安全加载的类型、常量和纯校验逻辑；不得依赖 Main 或 Renderer 实现，也不得暴露任意主机路径。

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`assetProtocol.ts`](./assetProtocol.ts) | TypeScript IPC DTO | 定义资产导入动作和结果。 | `ASSET_IPC_CHANNEL`、`AssetInvocation`、`VnAssetsApi`。 |
| [`editorSettingsProtocol.ts`](./editorSettingsProtocol.ts) | TypeScript Runtime Guard | 定义版本化语言设置。 | 默认设置、`isEditorLanguage`、`isEditorSettings`、`isEditorSettingsPatch`、`VnEditorSettingsApi`。 |
| [`engineProtocol.ts`](./engineProtocol.ts) | TypeScript 映射类型 | 定义全部引擎方法、参数和响应。 | `ENGINE_METHODS`、`EngineParamsByMethod`、`BackendRequest/Response`、`VnEngineApi`。 |
| [`exportIpcChannel.ts`](./exportIpcChannel.ts) | TypeScript | 提供 Preload 安全的最小导出通道常量。 | `EXPORT_GAME_IPC_CHANNEL`；不引入 Node 或文件名模块。 |
| [`exportProtocol.ts`](./exportProtocol.ts) | TypeScript、filenamify/browser | 定义运行包、Web 包和独立应用导出契约。 | `standaloneApplicationMetadataError`、`ExportGameInvocation/Result`、`VnGameExportApi`。 |
| [`filenamify-browser.d.ts`](./filenamify-browser.d.ts) | TypeScript Declaration | 补充浏览器入口类型。 | 声明 `filenamify(value, options)` 默认导出。 |
| [`global.d.ts`](./global.d.ts) | TypeScript Declaration | 描述 Preload 注入的 Window API。 | 聚合 `vnAssets`、`vnEngine`、`vnEditorSettings`、`vnGameExport`、`vnProjectFiles`。 |
| [`projectFileProtocol.ts`](./projectFileProtocol.ts) | TypeScript IPC DTO | 定义项目文件动作、会话和菜单命令。 | 固定 `PROJECT_FILE_NAME`、`ProjectFileInvocation/Response`、`VnProjectFilesApi`。 |
| [`projectTypes.ts`](./projectTypes.ts) | Runtime DTO、TypeScript | 扩展作者工程节点并维护 Runtime 边界。 | `isStoryExtensionNode`、`semanticSceneNodes`、`formVisibleSceneNodes`、`toRuntimeProjectDocument`。 |
