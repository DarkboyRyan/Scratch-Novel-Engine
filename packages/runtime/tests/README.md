# Runtime Tests

[返回 Runtime](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`characterEffect.test.ts`](./characterEffect.test.ts) | Vitest | 验证人物特效严格字段、类型和范围 | `isCharacterEffect`、边界值 |
| [`gameRuntime.contract.test.ts`](./gameRuntime.contract.test.ts) | Vitest | 验证共享剧情执行合同和错误语义 | 对白、选择、逻辑、循环、CG、人物状态 |
| [`gameRuntimeSnapshot.test.ts`](./gameRuntimeSnapshot.test.ts) | Vitest | 验证快照版本、往返恢复和兼容 | v1–v4 输入、等价比较、恢复拒绝 |
| [`logicValidation.test.ts`](./logicValidation.test.ts) | Vitest | 验证逻辑值、变量名、嵌套与预算限制 | UTF-8 长度、类型守卫、项目扫描 |
