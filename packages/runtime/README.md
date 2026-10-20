# Runtime

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

`@vnengine/runtime` 接收普通 TypeScript 数据，返回可序列化的剧情状态，不依赖 Electron、DOM、计时器、媒体播放或存储。

## 使用流程

1. `startGame(project)` 从入口场景创建状态。
2. `advanceGame(project, state)` 处理自动节点，直到对白、选择、视频、CG 等待、结束或运行错误。
3. 用 `selectChoice` 提交选择；CG 图片就绪并完成入场等待后调用 `completeCgLeadIn`。
4. 用 `createGameRuntimeSnapshot` 保存 Snapshot v5；严格校验后通过 `restoreGameRuntimeSnapshot` 恢复，也可受限恢复 v1–v4。

上游负责把 Runtime v13 等外部格式规范化。默认语言由 Player 外壳读取，标题页和 CG 样式使用经过校验的数据。

If/Else、Repeat 和 CG 在执行前检查配对。逻辑只支持布尔、有限数字和受限字符串，并限制嵌套、循环、步数和变量预算。CG 内只允许对白，入场等待最多 60 秒。瞬时人物特效不写入快照，快照保留最终透明度与事件序号，避免读档重播。剧情背景和立绘缩放为 10%–300% 的整数，空背景与清除立绘为 100%；旧快照补 100%。

## 开发

- [源码](./src/README.md)：公共类型、状态机和快照；统一从 `src/index.ts` 导入。
- [测试](./tests/README.md)：运行行为、预算和快照兼容性。

```sh
pnpm --dir packages/runtime typecheck
pnpm --dir packages/runtime test
```

新增节点时同步补齐类型、状态转换、快照策略和测试。
