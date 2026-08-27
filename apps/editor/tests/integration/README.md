# Editor 集成测试

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`backendProtocol.test.ts`](./backendProtocol.test.ts) | Vitest、Node.js Child Process、C++ JSONL | 验证真实后端的协议和事务行为。 | 启动 `vn_engine_backend`，覆盖项目、对话、背景、人物、选择、逻辑、CG 的新增/更新/移动/删除。 |
| [`runtimeBundlePlayerCompatibility.test.ts`](./runtimeBundlePlayerCompatibility.test.ts) | Vitest、Editor Exporter、Player Loader | 验证 Editor 导出到 Player 读取的兼容性。 | 编译作者工程、导出 Runtime v9、用 `loadRuntimeBundle` 回读并调用 `startGame`。 |

运行方式：`pnpm --dir apps/editor test:integration`。该命令会先编译 C++ 后端。
