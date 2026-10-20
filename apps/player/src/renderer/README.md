# Player Renderer

[中文](./README.md) | [English](./README.en.md)

[返回 Player Source](../README.md)

桌面和 Web 共用这套 React 界面，通过 `PlayerGateway` 调用宿主能力，不直接访问 Electron、文件系统或 IndexedDB。

`App` 负责加载、标题页、Runtime 生命周期、设置和存读档；根据设置来源选择玩家语言或游戏包默认语言，并忽略过期的加载结果。恢复默认也使用当前包语言。语言切换只影响播放器界面，作者文本保持原文。

`GameScreen` 渲染剧情、选项、CG 和视频，协调暂停与快进；背景和立绘缩放交给共享 `VisualStage`。媒体 URL 按资源 ID 异步解析，过期结果不会覆盖新请求。顶层统一处理错误本地化和弹窗焦点。

跨宿主功能先扩展 Gateway；通用组件放在 `packages/player-ui`。Runtime 通过新状态推进，存档使用快照 API，不序列化组件状态。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerRenderer.test.tsx
pnpm --dir apps/player lint
pnpm --dir apps/player typecheck
```

## 目录

- [`player-ui`](../../../../packages/player-ui/README.md)
- [`styles`](./styles/README.md)

## 主要文件

- [`App.tsx`](./App.tsx)
- [`GameScreen.tsx`](./GameScreen.tsx)
- [`index.tsx`](./index.tsx)
- [`playerGateway.ts`](./playerGateway.ts)
- [`useResolvedMediaUrls.ts`](./useResolvedMediaUrls.ts)
