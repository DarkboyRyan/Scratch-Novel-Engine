# Runtime 测试

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

测试直接构造 `ProjectDocument`，检查状态、错误和快照往返，不启动 Electron 或浏览器。

- [`gameRuntime.contract.test.ts`](./gameRuntime.contract.test.ts)：对白、媒体、选择、逻辑、循环、CG、缩放和人物事件。
- [`gameRuntimeSnapshot.test.ts`](./gameRuntimeSnapshot.test.ts)：Snapshot v1–v5 校验、恢复和旧版缩放默认值。
- [`logicValidation.test.ts`](./logicValidation.test.ts)：变量、UTF-8 字节限制、嵌套和项目预算。
- [`characterEffect.test.ts`](./characterEffect.test.ts)：七类特效的字段、时长、强度和方向。

```sh
pnpm --dir packages/runtime test
```

命令先用 `tsconfig.test.json` 编译测试范围，再运行 Vitest。回归用例应直接断言运行状态，并覆盖畸形输入和预算边界。
