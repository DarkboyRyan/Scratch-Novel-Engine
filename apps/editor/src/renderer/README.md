# Renderer 渲染层

[返回 Editor 源码](../README.md)

Renderer 是 Electron Editor 的 React 界面层，负责界面组合、项目会话和各创作功能入口。它运行在沙箱中，只消费 Application 层端口和 Preload 网关，不直接访问文件系统、子进程或 Electron Main 实现。

## 架构位置与工作方式

1. [`index.tsx`](./index.tsx) 建立 React 根和国际化上下文，[`App.tsx`](./App.tsx) 组合项目状态、编辑模式与全局对话框。
2. [`hooks/`](./hooks/README.md) 读取设置和项目会话，Application 动作把 UI 意图转换为类型化 Engine/平台调用。
3. Feature 模块更新作者工程后刷新项目投影，并把当前场景状态交给共享组件或正式游戏预览显示。

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
| [index.tsx](./index.tsx) | React + TypeScript | 创建 React 根节点并挂载编辑器应用与国际化上下文 | 模块内部类型与实现 |
| [projectSavePreparation.ts](./projectSavePreparation.ts) | TypeScript | 在保存前同步当前编辑模式中的草稿并返回可保存状态 | `prepareProjectSave` |
| [projectSessionPresentation.ts](./projectSessionPresentation.ts) | TypeScript | 根据项目会话状态生成窗口标题与未保存标记 | `projectWindowTitle`、`projectSaveStatus` |

## 开发与验证

- Renderer 代码应保持浏览器可执行，不引入 `node:*`、Main 源码或未经网关包装的 `window` 能力。
- 状态所有权优先放在 `App`、专用 Hook 或 Feature 内，不要在展示组件中复制项目真相。
- 运行 `pnpm --dir apps/editor lint` 与 `pnpm --dir apps/editor typecheck`；交互改动使用最接近的 `*.test.tsx` 做定向验证。
