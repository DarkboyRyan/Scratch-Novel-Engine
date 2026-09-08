# Runtime

[返回 Shared Packages](../README.md)

`@vnengine/runtime` 是平台无关的视觉小说执行核心。它以普通 TypeScript 数据为输入，返回
可序列化的 `GameRuntime` 状态；包内没有 Electron、DOM、计时器、媒体播放器或存储依赖，
因此 Editor 预览、桌面 Player 和 Web Player 可以共享完全一致的剧情推进规则。

## 架构位置

Runtime 位于“内容校验”和“画面渲染”之间。上游 Loader/Compiler 负责把 Author 或 Bundle
格式规范化为当前 `ProjectDocument`，Runtime 负责状态转换，下游 UI 根据状态播放媒体并
把用户事件送回来。当前导出格式为 Runtime v13；Runtime v11 是剧情图片缩放的历史
里程碑，v12 的 `game.defaultLanguage` 由 Player 外壳在创建 Runtime 前消费，v13 则携带标题页与
CG 画廊的严格样式 DTO。进度快照
写出 Snapshot v5，并可受限恢复
旧 v1–v4 快照。

## 核心工作流

1. 使用 `startGame(project)` 从入口场景创建初始状态。
2. 使用 `advanceGame(project, state)` 推进自动节点，直到遇到对白、选择、视频、CG 等待、
   完成或可本地化的运行错误。
3. 选择分支调用 `selectChoice`；CG 图片就绪并完成 lead-in 后调用 `completeCgLeadIn`。
4. 保存时用 `createGameRuntimeSnapshot` 生成 Snapshot v5；读取时先严格校验，再调用
   `restoreGameRuntimeSnapshot` 恢复到当前项目。

If/Else、Repeat 与 CG 范围在执行前编译为配对控制流。逻辑值只允许布尔、有限数字和
受限字符串，不执行任意代码；嵌套深度、重复次数、自动步数和变量总量都设有预算。CG
范围内只能包含对白，lead-in 最大为 60 秒。人物特效作为一次性事件输出，快照只保存最终
透明度与单调序号，避免读档后重播瞬时动画。场景初始背景、时间线背景与人物立绘使用
10%–300% 的整数缩放；无背景与清除立绘必须为 100%，标题页背景和 CG 不属于该契约。
Snapshot v5 保存实际缩放，旧快照恢复时采用 100% 默认值。

## 目录索引

| 目录 | 框架 / 技术 | 主要作用 |
| --- | --- | --- |
| [`src/`](./src/README.md) | TypeScript | 项目类型、剧情状态机、逻辑校验、人物特效和快照。 |
| [`tests/`](./tests/README.md) | Vitest | 执行合同、预算边界和 Snapshot v1–v5 兼容测试。 |

| 文件 | 主要作用 |
| --- | --- |
| [`package.json`](./package.json) | 包入口、workspace 名称与验证脚本。 |
| [`tsconfig.json`](./tsconfig.json) | 生产源码的严格 TypeScript 配置。 |
| [`tsconfig.test.json`](./tsconfig.test.json) | 测试源码的独立编译范围。 |

## 开发与验证

```sh
pnpm --dir packages/runtime typecheck
pnpm --dir packages/runtime test
```

公共 API 统一由 `src/index.ts` 导出。新增节点时，应同步补齐项目类型、控制流/状态转换、
Snapshot 策略和合同测试；不要把平台持久化或 UI 状态放入本包。
