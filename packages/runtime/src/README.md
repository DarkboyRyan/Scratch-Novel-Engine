# Runtime 源码

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

调用方统一从 [`index.ts`](./index.ts) 导入公共 API。

| 文件 | 职责 |
| --- | --- |
| [`projectTypes.ts`](./projectTypes.ts) | 规范化项目、节点和资源类型。 |
| [`gameRuntime.ts`](./gameRuntime.ts) | 剧情推进、选择、逻辑、循环、CG 和人物状态。 |
| [`gameRuntimeSnapshot.ts`](./gameRuntimeSnapshot.ts) | Snapshot v1–v5 校验、保存、比较和恢复。 |
| [`logicValidation.ts`](./logicValidation.ts) | 逻辑 AST、变量和执行预算。 |
| [`characterEffect.ts`](./characterEffect.ts) | 七类人物特效及字段约束。 |
| [`imageScale.ts`](./imageScale.ts) | 缩放范围与默认值的公共定义。 |

`advanceGame` 持续处理自动节点；选择、视频结束和 CG 入场等待完成由宿主回传。无效控制结构返回稳定错误。Snapshot 保存变量、循环栈、CG、图片缩放、人物层和最终透明度，只保留瞬时特效的序号。

剧情图片缩放为 10–300 的整数，空背景和清除人物为 100；标题页与 CG 不读取该字段。Runtime v1–v10 与 Snapshot v1–v4 的兼容输入补 100%。

函数保持可序列化，不读取时间、磁盘或 DOM。自动节点受步数预算限制，循环状态需要进入 Snapshot。修改后运行 `pnpm --dir packages/runtime test`，并检查 Editor/Player 类型。
