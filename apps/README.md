# 应用程序

[返回项目首页](../README.md)

`apps/` 放置最终交付给作者和玩家的应用。Editor 拥有创作与导出能力，Player 只消费已经
导出的只读内容；两者复用 `packages/` 中的平台无关 Runtime 与 UI，但各自保留独立的
Electron Main、Preload、安全边界和发布流程。

## 架构位置

Editor Renderer 不直接读写磁盘，而是通过受限 IPC 调用 Electron Main，再由 Main 驱动
C++ JSONL Backend。Player 使用独立的 Main/Preload 加载并校验 Runtime Bundle，桌面版与
Web 版随后都把规范化项目交给同一 Runtime 执行。

## 应用索引

| 子目录 | 框架 / 技术 | 主要作用 |
| --- | --- | --- |
| [`editor/`](./editor/README.md) | Electron、React、Blockly、TypeScript | 创作工程、管理资源、预览剧情并导出桌面/Web 游戏。 |
| [`player/`](./player/README.md) | Electron、React、Vite、HTML5 | 运行导出游戏，提供标题页、CG、设置、存读档和播放控制。 |

## 核心工作流

1. Editor 打开或创建 Author Project，由 C++ Core 验证并维护权威状态。
2. Renderer 通过表单或 Blockly 发出原子编辑命令，并使用共享 Runtime 进行正式语义预览。
3. 导出器将 Author v21 编译为 Runtime v12 内容包，剥离仅用于创作的节点、校验资源闭包，并写入导出时 Main 权威 Editor 语言。
4. Desktop/Web Player 严格读取内容包，执行剧情，并在平台存储中隔离设置与 Snapshot v5。

当前剧情图片缩放覆盖场景初始背景、时间线背景节点和人物立绘节点，范围为 10%–300% 的
整数，默认 100%；标题页背景与 CG 仍保持原有尺寸语义。
Runtime v11 是该缩放能力的历史里程碑；当前 v12 新增包默认语言。Player Reader
兼容 v1–v12，旧 v1–v11 缺失语言时补 `zh-CN`，玩家已持久的语言仍优先。

## 开发与验证

应用没有共享的根脚本，请在目标目录执行命令：

```sh
pnpm --dir apps/editor start
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
pnpm --dir apps/editor test

pnpm --dir apps/player start
pnpm --dir apps/player typecheck
pnpm --dir apps/player lint
pnpm --dir apps/player test
```

涉及跨应用显示或运行行为时，还应验证 [`packages/runtime/`](../packages/runtime/README.md)
和 [`packages/player-ui/`](../packages/player-ui/README.md)；不要在 Player 中重新实现一套剧情状态机。
