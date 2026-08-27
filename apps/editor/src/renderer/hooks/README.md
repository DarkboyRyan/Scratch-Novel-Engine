# React Hooks

[返回 Renderer](../README.md)

本目录保存跨多个 Renderer 组件复用、且具有明确生命周期的 React 状态 Hook。它们把平台订阅、异步请求和 Engine 项目状态收拢到稳定接口中，让组件专注于渲染与用户意图。

## 架构位置与工作方式

1. Hook 通过 Application Gateway 读取初始设置或项目，并注册平台变化订阅。
2. 用户操作触发异步命令时，Hook 管理 loading、error、revision、dirty 等会话状态并忽略过期结果。
3. 最新状态和受控动作返回给 `App` 与 Features；卸载时取消订阅，避免跨窗口或旧组件更新。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [useEditorSettings.ts](./useEditorSettings.ts) | TypeScript | 读取、订阅并更新编辑器语言等持久化设置 | `EditorSettingsState`、`useEditorSettings` |
| [useEngineProject.ts](./useEngineProject.ts) | TypeScript | 管理引擎项目加载、刷新、修订、错误和保存状态 | `OpenProjectStatus`、`ImportAssetStatus`、`ImportImageStatus`、`ExportGameStatus`、`useEngineProject`、`EngineProjectState` |

## 开发与验证

- 异步 Hook 要处理卸载、请求乱序和订阅清理；项目修订与脏状态不能仅由局部乐观更新推断。
- 对外动作应保持稳定且返回可判断的结果，便于 `App` 协调保存、导出和错误提示。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/useEditorSettings.test.tsx tests/unit/useEngineProject.test.tsx`。
