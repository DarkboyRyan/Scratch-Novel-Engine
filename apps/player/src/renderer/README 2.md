# Player Renderer

[返回 Player Source](../README.md)

Player 的 React 界面，业务能力均通过 `PlayerGateway` 调用。

同一套 Renderer 也由 Web Player 复用。组件只面向 `PlayerGateway`、Runtime 和 `@vnengine/player-ui`，因此不会直接导入 Electron、Node.js 文件系统或 IndexedDB。桌面入口注入 Preload Gateway，Web 入口注入浏览器 Gateway。

## 界面与状态流

`App` 是宿主级状态机：启动时并发读取设置和游戏，按设置的 `default`/`stored` 来源选择游戏包默认语言或玩家语言，且不允许较晚返回的请求覆盖当前包的有效语言。这只切换 Player 外壳，作者标题、场景名、对白、说话人和 Choice 保持原文。它还负责呈现加载/空/错误/标题状态，创建或恢复 Runtime，并协调设置、手动存读档、快速存读档和返回标题。恢复默认使用当前包语言和其余全局默认设置。所有 Gateway 结果先转换为稳定的本地化错误，不把宿主异常直接显示给玩家。Modal 由顶层统一处理焦点恢复与键盘关闭。

进入剧情后，`GameScreen` 根据 Runtime 状态渲染舞台、对白、选项、CG 和视频，并把背景与
人物的缩放状态传给共享 `VisualStage`；标题页背景和 CG 不参与剧情图片缩放。它还管理暂停、
操作栏快进、空格长按快进、页面隐藏和 CG lead-in；创建快照及持久化仍由 `App` 与 Gateway
协调。媒体资源通过 `useResolvedMediaUrls` 按 asset ID 异步解析，切换请求时会忽略过期结果。

## 开发约束

跨宿主功能应先扩展 `PlayerGateway`，并在桌面和 Web 实现中明确支持或拒绝。可复用的视觉组件、音频控制和本地化放在 [`@vnengine/player-ui`](../../../../packages/player-ui/README.md)，Player 特有的宿主编排留在这里。Runtime 必须以不可变的新状态推进，不要绕过快照 API 自行序列化组件 state。

修改交互后至少运行：

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerRenderer.test.tsx
pnpm --dir apps/player lint
pnpm --dir apps/player typecheck
```

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
