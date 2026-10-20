# Player UI

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

`@vnengine/player-ui` 为 Editor 预览、桌面 Player 和 Web Player 提供共享 React 界面。

组件使用受控属性和回调：`VisualStage` 展示背景、人物、对白和特效；`TitleScreen`、`CgGallery` 映射经过校验的页面样式；操作栏和对话框将用户意图交回宿主。组件不存储应用状态、设置或存档。

媒体通过 `MediaUrlResolver` 解析。包不提供全局主题 CSS，外观由 [Player 样式](../../apps/player/src/renderer/styles/player.css) 或 Editor 的局部样式控制。共享组件不依赖 Electron、Node.js 或宿主窗口能力。

## 使用与验证

```ts
import { PlayerUiProvider, VisualStage } from '@vnengine/player-ui';
```

公共 API 从 [`src/index.ts`](./src/index.ts) 导出，详见[源码说明](./src/README.md)。新增组件或 Hook 时同步更新导出和文档。

```sh
pnpm --dir packages/player-ui typecheck
pnpm --dir apps/player exec vitest run tests/unit/playerUiLocalization.test.tsx
```
