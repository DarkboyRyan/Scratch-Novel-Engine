# 通用组件

编辑器跨功能复用的 React 界面组件。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [CreateProjectDialog.tsx](./CreateProjectDialog.tsx) | React + TypeScript | 呈现新建项目表单并管理名称输入和确认流程 | `CreateProjectDialog` |
| [EditorSettingsDialog.tsx](./EditorSettingsDialog.tsx) | React + TypeScript | 呈现编辑器语言设置并提交或恢复设置草稿 | `EditorSettingsDialog` |
| [ErrorDialog.tsx](./ErrorDialog.tsx) | React + TypeScript | 以可访问模态框展示并关闭应用错误 | `ErrorDialog` |
| [PreviewPanel.tsx](./PreviewPanel.tsx) | React + TypeScript | 组合场景预览舞台、播放器状态与预览控制提示 | `PreviewPanel` |
| [RendererErrorBoundary.tsx](./RendererErrorBoundary.tsx) | React + TypeScript | 捕获 Renderer 渲染异常并提供可恢复的错误界面 | `RendererErrorBoundary` |
| [Toolbar.tsx](./Toolbar.tsx) | React + TypeScript | 提供项目、编辑模式、导出和编辑器设置等顶部操作 | `Toolbar` |
| [VisualStage.tsx](./VisualStage.tsx) | React + TypeScript | 兼容导出共享播放器 UI 中的视觉舞台组件 | `VisualStage` |
