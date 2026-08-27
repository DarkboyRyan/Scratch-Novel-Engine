# React Hooks

Renderer 跨组件复用的 React 状态 Hook。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [useEditorSettings.ts](./useEditorSettings.ts) | TypeScript | 读取、订阅并更新编辑器语言等持久化设置 | `EditorSettingsState`、`useEditorSettings` |
| [useEngineProject.ts](./useEngineProject.ts) | TypeScript | 管理引擎项目加载、刷新、修订、错误和保存状态 | `OpenProjectStatus`、`ImportAssetStatus`、`ImportImageStatus`、`ExportGameStatus`、`useEngineProject`、`EngineProjectState` |
