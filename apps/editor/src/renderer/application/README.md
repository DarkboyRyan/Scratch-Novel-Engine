# 应用服务层

Renderer 的应用服务与端口层，隔离 UI、preload API 和引擎命令。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [authoringPorts.ts](./authoringPorts.ts) | TypeScript | 定义表单编辑器和 Blockly 编辑器共享的创作命令端口 | `AddDialogueAction`、`UpdateDialogueAction`、`SetDialogueVoiceAction`、`ReorderDialogueAction`、`ReorderDialoguesAction`、`DeleteDialoguesAction` 等 46 项 |
| [createAuthoringActions.ts](./createAuthoringActions.ts) | TypeScript | 把 Engine API 封装成带错误处理和项目刷新的创作动作 | `AuthoringActions`、`createAuthoringActions` |
| [editorMediaGateway.ts](./editorMediaGateway.ts) | TypeScript | 为 Renderer 提供受平台网关约束的媒体 URL 解析能力 | `resolveEditorMediaUrl`、`resolveEditorAssetPreviewUrl` |
| [editorMode.ts](./editorMode.ts) | TypeScript | 定义表单与图形化两种编辑模式及其判断逻辑 | `EditorMode` |
| [editorPlatformGateway.ts](./editorPlatformGateway.ts) | TypeScript | 安全读取 preload 暴露的资产、项目文件和平台命令网关 | `EditorPlatformGateway`、`getEditorPlatformGateway`、`subscribeEditorProjectFileCommands` |
| [editorSettingsGateway.ts](./editorSettingsGateway.ts) | TypeScript | 封装编辑器设置的读取、更新、订阅和重启错误处理 | `EditorSettingsRestartRequiredError`、`isEditorSettingsRestartRequiredError`、`readEditorSettings`、`updateEditorSettings`、`subscribeEditorSettings` |
| [mediaPort.ts](./mediaPort.ts) | TypeScript | 声明与平台无关的媒体地址解析端口类型 | `MediaUrlResolver`、`AssetPreviewUrlResolver` |
