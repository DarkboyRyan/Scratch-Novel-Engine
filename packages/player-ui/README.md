# Player UI

[返回 Shared Packages](../README.md)

供 Editor 预览、桌面 Player 和 Web Player 共用的 React 界面库。

`@vnengine/player-ui` 提供视觉小说舞台和 Player 通用交互，但不拥有应用状态、文件系统或持久化。Editor 可用它预览当前工程，桌面/Web Player 则把真实 Runtime、设置和宿主回调传入同一批组件，从而让标题、对白、CG、存档和选项保持一致。

## 包边界

组件以受控 props 和回调工作：`VisualStage` 只渲染背景、立绘、对白与特效，并按 Runtime
提供的 10%–300% 比例缩放剧情背景与立绘；背景围绕中心缩放，立绘保持底部中心锚点。
`GameActionBar` 只发出保存、读取、快进和返回意图；`OptionsDialog` 与 `SaveSlotDialog` 不自行
读写设置或存档。媒体通过 `MediaUrlResolver` 把 asset ID 解析为当前宿主允许的 URL，音量和
音频生命周期由纯工具/Hook 组合。

此包不提供全局主题 CSS。组件输出稳定 class，由 Player 的 [`player.css`](../../apps/player/src/renderer/styles/player.css) 或 Editor 自己的作用域样式决定外观。共享组件不得导入 Electron、Node.js 或 Player 的 Main/Preload 模块，也不应假设浏览器具备窗口大小或全屏能力。

## 使用与验证

只从包入口导入公开 API：

```ts
import { PlayerUiProvider, VisualStage } from '@vnengine/player-ui';
```

新增公开组件、Hook 或类型时同步更新 [`src/index.ts`](./src/index.ts) 和源码 README。包本身执行类型检查，交互回归由消费它的 Player 测试覆盖：

```bash
pnpm --dir packages/player-ui typecheck
pnpm --dir apps/player exec vitest run tests/unit/playerUiLocalization.test.tsx
```

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `src` | React、TypeScript | 公共组件、Hooks、本地化与媒体控制 | [查看](./src/README.md) |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`package.json`](./package.json) | pnpm Workspace | 包入口、依赖和类型检查命令 | `exports`、`typecheck` |
| [`tsconfig.json`](./tsconfig.json) | TypeScript | React UI 包编译设置 | JSX、DOM、workspace 类型 |
