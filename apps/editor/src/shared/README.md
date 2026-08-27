# 跨进程共享契约

[返回 Editor 源码](../README.md)

Shared 定义 Main、Preload 与 Renderer 都能安全导入的 IPC 通道、DTO、全局 API 和纯项目转换。它只包含类型、常量和无主机副作用的校验逻辑，不得依赖 Main 或 Renderer 实现，也不得暴露任意主机路径。

## 架构位置与工作方式

1. 协议文件定义调用动作、参数、结果和运行时守卫，Main 与 Preload 使用相同通道常量。
2. Preload 将这些契约映射到 `window` 上的最小 API，Renderer 只通过 [`global.d.ts`](./global.d.ts) 看到能力。
3. Main 在执行特权操作前重新做运行时校验；项目转换函数则把作者模型投影到明确的 Runtime 边界。

## 文件

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

## 开发与验证

- Shared 必须保持浏览器安全且可序列化，不能导入 `electron`、`node:*`、Main 服务或 React 组件。
- 修改协议时同步更新 Main 校验、Preload 包装、Renderer Gateway 和双方测试；新增字段不能只依赖静态类型。
- 运行 `pnpm --dir apps/editor typecheck`，并定向执行相关协议测试，例如 `pnpm --dir apps/editor exec vitest run tests/unit/editorSettingsProtocol.test.ts tests/unit/validateEngineInvocation.test.ts`。
