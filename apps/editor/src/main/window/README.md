# 窗口管理

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`EditorWindowContext.ts`](./EditorWindowContext.ts) | Electron BrowserWindow、TypeScript | 聚合每个窗口独占的 Main 服务。 | `EditorWindowContext`、`EditorWindowContexts`；绑定后端、预览、项目与文件协调器。 |
| [`FileOperationCoordinator.ts`](./FileOperationCoordinator.ts) | TypeScript Promise | 防止同一窗口文件操作竞态。 | `FileOperationCoordinator.runExclusive` 提供异步互斥和忙碌错误。 |
| [`editorWindowPlacement.ts`](./editorWindowPlacement.ts) | TypeScript Geometry | 计算新窗口可见的级联位置。 | `cascadedEditorWindowPosition` 比较候选方向并钳制坐标。 |
| [`updateWindowDocumentPresentation.ts`](./updateWindowDocumentPresentation.ts) | Electron BrowserWindow | 同步项目名、未保存和脏状态到窗口。 | `updateWindowDocumentPresentation` 更新标题、represented filename 与 edited 标志。 |
