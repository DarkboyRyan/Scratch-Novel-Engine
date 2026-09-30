# Runtime Tests

[返回 Runtime](../README.md)

本目录以合同测试保护共享 Runtime 的平台无关行为。测试直接构造 `ProjectDocument`，不启动
Electron 或浏览器，因此可以精确验证每次输入后的状态、错误码和 Snapshot 往返结果。

重点覆盖正常推进与恶意/畸形输入：控制标记必须配对，CG body 只能包含对白，逻辑与变量
不能突破预算，人物特效必须满足严格字段组合，背景/立绘缩放必须是 10–300 的整数，旧
快照只能在仍可证明安全的状态下恢复并补 100% 缩放。

## 文件索引

| 文件 | 主要覆盖 | 关键合同 |
| --- | --- | --- |
| [`gameRuntime.contract.test.ts`](./gameRuntime.contract.test.ts) | 对白、媒体、选择、逻辑、循环、CG、图片缩放和人物状态。 | 推进停点、场景跳转缩放、错误语义、控制流与事件序号 |
| [`gameRuntimeSnapshot.test.ts`](./gameRuntimeSnapshot.test.ts) | Snapshot v1–v5 校验、比较与恢复。 | 缩放往返、旧版 100% 迁移、拒绝不一致状态 |
| [`logicValidation.test.ts`](./logicValidation.test.ts) | 值、变量名、嵌套和项目预算。 | UTF-8 字节限制、类型守卫、项目扫描 |
| [`characterEffect.test.ts`](./characterEffect.test.ts) | 七类人物特效及其字段边界。 | 时长、强度、方向、exact-field 校验 |

## 运行测试

```sh
pnpm --dir packages/runtime test
```

该命令会先使用 `tsconfig.test.json` 编译测试范围，再运行 Vitest。修复回归时应优先新增最小
合同用例，避免依赖 UI 快照掩盖 Runtime 状态错误。
