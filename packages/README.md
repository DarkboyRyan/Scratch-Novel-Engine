# 共享包

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

这里保存 Editor、桌面 Player 和 Web Player 共用的平台无关模块。

- [Runtime](./runtime/README.md)：剧情状态转换、逻辑、CG、人物状态和 Snapshot。
- [Player UI](./player-ui/README.md)：标题页、舞台、对白、选项、CG 和媒体组件。

Loader/Compiler 将外部格式规范化为 `ProjectDocument`，Runtime 处理推进事件，UI 展示状态并回传交互。宿主负责文件、IPC、媒体 URL、窗口和存档存储。

```sh
pnpm --dir packages/runtime typecheck
pnpm --dir packages/runtime test
pnpm --dir packages/player-ui typecheck
```

修改公共类型后检查 Editor 和 Player；历史格式迁移留在 Loader/Compiler 边界。
