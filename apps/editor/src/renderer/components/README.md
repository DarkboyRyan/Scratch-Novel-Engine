# 通用组件

[中文](./README.md) | [English](./README.en.md)

[返回 Renderer](../README.md)

本目录保存编辑器多个功能都会使用的 React 组件，包括顶栏、通用对话框、错误边界和静态场景预览。组件接收明确的状态与回调，业务写入仍由上层 `App`、Hook 或 Feature 控制，避免把项目会话藏进展示层。

## 工作方式

1. Renderer 顶层把本地化标签、项目状态和 Application 动作作为 props 传入组件。
2. 组件管理焦点、表单草稿和可视反馈，再通过回调提交用户意图。
3. 上层执行引擎或平台操作并传回新状态；`RendererErrorBoundary` 则在未处理渲染错误时提供最后的恢复界面。

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [CreateProjectDialog.tsx](./CreateProjectDialog.tsx) | 呈现新建项目表单并管理名称输入和确认流程 |
| [EditorSettingsDialog.tsx](./EditorSettingsDialog.tsx) | 呈现界面语言与 Daylight / Moonlight 颜色主题，并提交或恢复设置草稿 |
| [ErrorDialog.tsx](./ErrorDialog.tsx) | 以可访问模态框展示并关闭应用错误 |
| [PreviewPanel.tsx](./PreviewPanel.tsx) | 组合场景预览舞台、播放器状态与预览控制提示 |
| [RendererErrorBoundary.tsx](./RendererErrorBoundary.tsx) | 捕获 Renderer 渲染异常并提供可恢复的错误界面 |
| [Toolbar.tsx](./Toolbar.tsx) | 提供项目、编辑模式、导出和编辑器设置等顶部操作 |
| [VisualStage.tsx](./VisualStage.tsx) | 兼容导出共享播放器 UI 中的视觉舞台组件 |

## 开发与验证

- 对话框必须保持焦点可达、可关闭并具有明确标签；预览组件只能解析受控媒体 URL，不应自行访问文件系统。
- 新组件先判断是否确实跨 Feature 复用；仅服务单一业务的组件应留在对应 [`features/`](../features/README.md) 中。
- 使用对应的 Testing Library 用例定向验证，例如 `pnpm --dir apps/editor exec vitest run tests/unit/rendererErrorBoundary.test.tsx tests/unit/previewPanelLogicNotice.test.tsx`。
