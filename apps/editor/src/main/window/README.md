# 窗口管理

[返回 Electron Main](../README.md)

本目录维护 Electron 窗口与其 Main 侧服务之间的一一对应关系。它还负责串行化文件操作、安排新窗口位置，以及把项目名称和未保存状态反映到系统窗口外观。

## 架构位置与工作方式

1. 创建窗口时为其建立 `EditorWindowContext`，聚合独占的后端、项目、预览和协调器实例。
2. IPC 根据发送窗口取得上下文，文件类操作通过 `FileOperationCoordinator` 串行执行。
3. 项目会话变化后更新标题和系统文档状态；关闭窗口时销毁上下文及其资源。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`EditorWindowContext.ts`](./EditorWindowContext.ts) | Electron BrowserWindow、TypeScript | 聚合每个窗口独占的 Main 服务。 | `EditorWindowContext`、`EditorWindowContexts`；绑定后端、预览、项目与文件协调器。 |
| [`FileOperationCoordinator.ts`](./FileOperationCoordinator.ts) | TypeScript Promise | 防止同一窗口文件操作竞态。 | `FileOperationCoordinator.runExclusive` 提供异步互斥和忙碌错误。 |
| [`editorWindowPlacement.ts`](./editorWindowPlacement.ts) | TypeScript Geometry | 计算新窗口可见的级联位置。 | `cascadedEditorWindowPosition` 比较候选方向并钳制坐标。 |
| [`updateWindowDocumentPresentation.ts`](./updateWindowDocumentPresentation.ts) | Electron BrowserWindow | 同步项目名、未保存和脏状态到窗口。 | `updateWindowDocumentPresentation` 更新标题、represented filename 与 edited 标志。 |

## 开发与验证

- 窗口级服务不能在不同窗口之间共享可变会话；文件互斥只覆盖同一窗口，并应始终释放 Promise 链。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorWindowPlacement.test.ts tests/unit/projectFileSession.test.ts`，再用 `pnpm --dir apps/editor typecheck` 检查上下文装配。
