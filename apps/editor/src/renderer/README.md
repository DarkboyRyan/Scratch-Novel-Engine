# Renderer 渲染层

Electron Editor 的 Renderer 层，负责界面组合、项目会话和功能入口。

## 子目录

| 目录 | 主要作用 |
| --- | --- |
| [application](./application/README.md) | Renderer 的应用服务与端口层，隔离 UI、preload API 和引擎命令。 |
| [components](./components/README.md) | 编辑器跨功能复用的 React 界面组件。 |
| [features](./features/README.md) | 按业务能力划分的编辑器功能模块。 |
| [hooks](./hooks/README.md) | Renderer 跨组件复用的 React 状态 Hook。 |
| [i18n](./i18n/README.md) | 编辑器界面的中英文语言资源与上下文。 |
| [styles](./styles/README.md) | Renderer 的全局基础样式和编辑器业务样式。 |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [App.tsx](./App.tsx) | React + TypeScript | 组织编辑器主界面的项目会话、编辑模式、预览与全局对话框状态 | `App` |
| [editorMessages.ts](./editorMessages.ts) | TypeScript | 集中声明 Renderer 层复用的用户提示文本 | `EMPTY_DIALOGUE_MESSAGE` |
| [index.tsx](./index.tsx) | React + TypeScript | 创建 React 根节点并挂载编辑器应用与国际化上下文 | 模块内部类型与实现 |
| [projectSavePreparation.ts](./projectSavePreparation.ts) | TypeScript | 在保存前同步当前编辑模式中的草稿并返回可保存状态 | `prepareProjectSave` |
| [projectSessionPresentation.ts](./projectSessionPresentation.ts) | TypeScript | 根据项目会话状态生成窗口标题与未保存标记 | `projectWindowTitle`、`projectSaveStatus` |
