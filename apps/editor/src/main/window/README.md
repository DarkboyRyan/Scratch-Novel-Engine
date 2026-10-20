# 窗口管理

[中文](./README.md) | [English](./README.en.md)

[返回 Electron Main](../README.md)

本目录维护 Electron 窗口与其 Main 侧服务之间的一一对应关系。它还负责串行化文件操作、安排新窗口位置，以及把项目名称和未保存状态反映到系统窗口外观。

## 工作方式

1. 创建窗口时为其建立 `EditorWindowContext`，聚合独占的后端、项目、预览和协调器实例。
2. IPC 根据发送窗口取得上下文，文件类操作通过 `FileOperationCoordinator` 串行执行。
3. 项目会话变化后更新标题和系统文档状态；关闭窗口时销毁上下文及其资源。

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [`EditorWindowContext.ts`](./EditorWindowContext.ts) | 聚合每个窗口独占的 Main 服务。 |
| [`FileOperationCoordinator.ts`](./FileOperationCoordinator.ts) | 防止同一窗口文件操作竞态。 |
| [`editorWindowPlacement.ts`](./editorWindowPlacement.ts) | 计算新窗口可见的级联位置。 |
| [`updateWindowDocumentPresentation.ts`](./updateWindowDocumentPresentation.ts) | 同步项目名、未保存和脏状态到窗口。 |

## 开发与验证

- 窗口级服务不能在不同窗口之间共享可变会话；文件互斥只覆盖同一窗口，并应始终释放 Promise 链。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorWindowPlacement.test.ts tests/unit/projectFileSession.test.ts`，再用 `pnpm --dir apps/editor typecheck` 检查上下文装配。
