# Shared Packages

[返回项目首页](../README.md)

`packages/` 保存 Editor、桌面 Player 与 Web Player 共用的平台无关模块。这里不拥有文件
系统、Electron IPC 或作者工程写入能力：Runtime 接收已经规范化的项目数据，Player UI
接收运行状态并负责展示。这个边界保证编辑预览与正式播放使用相同语义。

## 架构位置

导出器与 Player Loader 负责把外部格式转换为共享包所需的数据；共享包只向上暴露类型、
纯状态转换和 React 组件。平台相关的媒体 URL、存档持久化和窗口控制仍由各应用注入。

## 包索引

| 子目录 | 框架 / 技术 | 主要作用 |
| --- | --- | --- |
| [`runtime/`](./runtime/README.md) | TypeScript、Vitest | 剧情执行、逻辑控制、CG、图片缩放、人物状态与 Snapshot v5。 |
| [`player-ui/`](./player-ui/README.md) | React、TypeScript、CSS | 标题、舞台、对白、选项、CG 和媒体展示组件。 |

## 核心工作流

1. 上游将 Runtime Bundle 校验并规范化为 `ProjectDocument`。
2. `@vnengine/runtime` 把输入事件转换为新的 `GameRuntime` 状态。
3. `@vnengine/player-ui` 根据该状态渲染画面，并把选择、推进和媒体完成事件交回宿主。
4. 宿主负责设置、媒体解析和 Snapshot 的实际存储，不把平台对象写入共享状态。

## 开发与验证

```sh
pnpm --dir packages/runtime typecheck
pnpm --dir packages/runtime test
pnpm --dir packages/player-ui typecheck
```

修改公共类型时，需要同时检查 Editor 与 Player 的消费端。格式迁移应在 Loader/Compiler
边界完成，避免让共享组件感知多个历史文件版本。
