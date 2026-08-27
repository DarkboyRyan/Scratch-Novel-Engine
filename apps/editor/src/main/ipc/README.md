# IPC 入口

所有入口先验证调用 Frame 和精确参数，再调用当前窗口上下文；Renderer 不能向 Main 传入任意本机路径。

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`registerAssetIpc.ts`](./registerAssetIpc.ts) | Electron ipcMain、Dialog | 处理图片、音频和视频导入。 | `registerAssetIpc`；校验来源、独占文件操作、更新预览和窗口状态。 |
| [`registerEditorSettingsIpc.ts`](./registerEditorSettingsIpc.ts) | Electron ipcMain | 处理语言设置读取和更新。 | `isEditorSettingsInvocation`、`broadcastEditorSettings`、`registerEditorSettingsIpc`。 |
| [`registerEngineIpc.ts`](./registerEngineIpc.ts) | Electron ipcMain | 将引擎命令发送到 C++ 会话。 | `registerEngineIpc`；验证命令并同步项目脏状态。 |
| [`registerExportIpc.ts`](./registerExportIpc.ts) | Electron ipcMain | 接收游戏导出请求。 | `registerExportIpc`；调用 `runExportGameWorkflow` 并返回结构化结果。 |
| [`registerProjectFileIpc.ts`](./registerProjectFileIpc.ts) | Electron ipcMain | 接收项目文件操作。 | `registerProjectFileIpc`；路由新建、打开、保存和会话查询。 |
| [`validateAssetInvocation.ts`](./validateAssetInvocation.ts) | TypeScript Guard | 校验资产导入参数。 | `isAssetInvocation` 仅允许白名单动作和精确空参数。 |
| [`validateEngineInvocation.ts`](./validateEngineInvocation.ts) | TypeScript Guard、Runtime 校验器 | 校验全部引擎方法参数。 | `isEngineInvocation` 按方法检查键集合、ID、数值、逻辑、CG 和人物特效。 |
| [`validateExportInvocation.ts`](./validateExportInvocation.ts) | TypeScript Guard | 校验导出模式和应用元数据。 | `isStandaloneApplicationMetadata`、`isExportGameInvocation`。 |
| [`validateProjectFileInvocation.ts`](./validateProjectFileInvocation.ts) | TypeScript Guard | 校验项目文件操作。 | `isProjectFileInvocation` 检查动作、可选名称和禁止路径参数。 |
