# Editor 集成测试

[返回 Editor 测试](../README.md)

本目录验证无法仅靠模块替身覆盖的真实边界：Electron Main 与 C++ JSONL 后端的协议，以及 Editor 导出产物与 Player Runtime 的兼容性。用例会启动子进程或创建临时产物，因此比单元测试更慢，也更接近发布路径。

## 架构位置与工作方式

1. 测试命令先通过 CMake 构建 `vn_engine_backend`，再由 Vitest 启动集成用例。
2. 后端协议用例通过 stdin/stdout 发送真实命令序列并检查事务、结构和错误响应。
3. 兼容性用例编译作者工程、导出 Runtime Bundle，再用 Player Loader 和 Runtime 启动流程回读。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`backendProtocol.test.ts`](./backendProtocol.test.ts) | Vitest、Node.js Child Process、C++ JSONL | 验证真实后端的协议和事务行为。 | 启动 `vn_engine_backend`，覆盖项目、对话、背景、人物、选择、逻辑、CG 的新增/更新/移动/删除。 |
| [`runtimeBundlePlayerCompatibility.test.ts`](./runtimeBundlePlayerCompatibility.test.ts) | Vitest、Editor Exporter、Player Loader | 验证 Editor 导出到 Player 读取的兼容性。 | 编译 Author v21、导出 Runtime v12，以英文默认语言和非默认比例覆盖场景初始背景、时间线背景和人物立绘，再用 `loadRuntimeBundle` 回读并调用 `startGame` 验证契约。 |

## 开发与验证

- 每个用例必须使用独立临时目录和进程，并在失败路径也完成清理；不要依赖开发者已有项目或打包目录。
- 修改后端命令、作者/Runtime 版本、导出结构或 Player Loader 时，应更新这里的跨边界断言。
- 运行 `pnpm --dir apps/editor test:integration`；该命令会先编译 C++ 后端。只调试单个文件时仍需先保证后端已构建。
