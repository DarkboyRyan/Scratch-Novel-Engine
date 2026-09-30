# 应用服务层

[返回 Renderer](../README.md)

Application 目录是 Renderer UI 与 Preload/Engine API 之间的适配层。它定义编辑器真正需要的端口和动作，使表单、Blockly 与其他组件共享同一创作语义，同时保持平台细节可替换、可测试。

## 架构位置与工作方式

1. UI 通过 `authoringPorts.ts` 中的动作类型表达新增、更新、重排或删除等用户意图。
2. `createAuthoringActions.ts` 调用 Engine API、统一错误处理，并在成功后刷新项目状态；各 Gateway 只暴露受允许的平台能力。
3. Feature 收到更新后的项目投影并重新渲染，媒体和设置结果也以浏览器安全的数据返回组件。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [authoringPorts.ts](./authoringPorts.ts) | TypeScript | 定义表单编辑器和 Blockly 编辑器共享的创作命令端口 | `AddDialogueAction`、`UpdateDialogueAction`、`SetDialogueVoiceAction`、`ReorderDialogueAction`、`ReorderDialoguesAction`、`DeleteDialoguesAction` 等 46 项 |
| [createAuthoringActions.ts](./createAuthoringActions.ts) | TypeScript | 把 Engine API 封装成带错误处理和项目刷新的创作动作 | `AuthoringActions`、`createAuthoringActions` |
| [editorMediaGateway.ts](./editorMediaGateway.ts) | TypeScript | 为 Renderer 提供受平台网关约束的媒体 URL 解析能力 | `resolveEditorMediaUrl`、`resolveEditorAssetPreviewUrl` |
| [editorMode.ts](./editorMode.ts) | TypeScript | 定义表单、图形化与 Code 三种编辑模式 | `EditorMode` |
| [editorSection.ts](./editorSection.ts) | TypeScript | 定义剧情流程与资源管理两个顶层工作区，切换时保留当前剧情编辑模式 | `WorkspaceSection` |
| [editorPlatformGateway.ts](./editorPlatformGateway.ts) | TypeScript | 安全读取 preload 暴露的资产、项目文件和平台命令网关，并识别资源管理契约版本 | `EditorPlatformGateway`、`supportsAssetManagement`、`getEditorPlatformGateway`、`subscribeEditorProjectFileCommands` |
| [editorSettingsGateway.ts](./editorSettingsGateway.ts) | TypeScript | 封装编辑器设置的读取、更新、订阅和重启错误处理 | `EditorSettingsRestartRequiredError`、`isEditorSettingsRestartRequiredError`、`readEditorSettings`、`updateEditorSettings`、`subscribeEditorSettings` |
| [mediaPort.ts](./mediaPort.ts) | TypeScript | 声明与平台无关的媒体地址解析端口类型 | `MediaUrlResolver`、`AssetPreviewUrlResolver` |

## 开发与验证

- 新的创作命令应先加入端口，再由统一动作适配 Engine；不要让 Feature 各自复制错误处理和刷新逻辑。
- Gateway 不应返回任意主机路径或 Electron 对象，缺少 Preload 能力时要给出明确的不可用结果。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/createAuthoringActions.test.ts tests/unit/preloadEngineApi.test.ts tests/unit/preloadEditorSettings.test.ts`。
