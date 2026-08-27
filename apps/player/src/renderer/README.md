# Player Renderer

[返回 Player Source](../README.md)

桌面 Player 的 React 界面，业务能力均通过 `PlayerGateway` 调用。

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `styles` | CSS | Player 全局设计与组件样式 | [查看](./styles/README.md) |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`App.tsx`](./App.tsx) | React | 顶层加载、标题、存读档、设置和游戏状态机 | `App`、错误本地化、Modal 焦点管理 |
| [`GameScreen.tsx`](./GameScreen.tsx) | React、Runtime | 场景播放、CG、选项、媒体和快进 | `GameScreen`、空格长按、操作栏回调 |
| [`index.tsx`](./index.tsx) | ReactDOM | 桌面界面入口 | `createRoot`、`App` |
| [`playerGateway.ts`](./playerGateway.ts) | TypeScript | UI 与宿主能力的端口 | `PlayerGateway`、`preloadPlayerGateway` |
| [`useResolvedMediaUrls.ts`](./useResolvedMediaUrls.ts) | React Hook | 批量解析资源 URL | `useResolvedMediaUrls`、失效请求取消 |
