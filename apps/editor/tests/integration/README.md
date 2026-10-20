# Editor 集成测试

[中文](./README.md) | [English](./README.en.md)

[返回 Editor 测试](../README.md)

本目录验证无法仅靠模块替身覆盖的真实边界：Electron Main 与 C++ JSONL 后端的协议，以及 Editor 导出产物与 Player Runtime 的兼容性。用例会启动子进程或创建临时产物，因此比单元测试更慢，也更接近发布路径。

## 工作方式

1. 测试命令先通过 CMake 构建 `vn_engine_backend`，再由 Vitest 启动集成用例。
2. 后端协议用例通过 stdin/stdout 发送真实命令序列并检查事务、结构和错误响应。
3. 兼容性用例编译作者工程、导出 Runtime Bundle，再用 Player Loader 和 Runtime 启动流程回读。

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [`backendProtocol.test.ts`](./backendProtocol.test.ts) | 验证真实后端的协议和事务行为。 |
| [`runtimeBundlePlayerCompatibility.test.ts`](./runtimeBundlePlayerCompatibility.test.ts) | 验证 Editor 导出到 Player 读取的兼容性。 |

## 开发与验证

- 每个用例必须使用独立临时目录和进程，并在失败路径也完成清理；不要依赖开发者已有项目或打包目录。
- 修改后端命令、作者/Runtime 版本、导出结构或 Player Loader 时，应更新这里的跨边界断言。
- 运行 `pnpm --dir apps/editor test:integration`；该命令会先编译 C++ 后端。只调试单个文件时仍需先保证后端已构建。
