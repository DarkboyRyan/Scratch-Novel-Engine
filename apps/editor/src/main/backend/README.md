# C++ 后端桥接

[返回 Electron Main](../README.md)

本目录把 Electron Main 与 C++20 权威作者模型连接起来。每个编辑器窗口拥有独立的 JSONL 子进程会话，请求必须关联响应、受超时保护，并在进入 Renderer 前完成运行时结构校验。

## 架构位置与工作方式

1. 窗口上下文通过 `backendPath.ts` 找到并检查开发或打包后的后端可执行文件。
2. `backendClient.ts` 以逐行 JSON 发送命令、关联响应，并处理超时、保存快照和异常退出。
3. `backendResponse.ts` 把不可信进程输出验证为 Shared DTO，随后 IPC 才把结果交给 Renderer。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`backendClient.ts`](./backendClient.ts) | Node.js Child Process、Readline | 管理窗口独占的 C++ JSONL 会话。 | `BackendClient`、`backendRequestTimeoutMs`；请求关联、超时、异常退出与保存快照处理。 |
| [`backendPath.ts`](./backendPath.ts) | Electron app、Node.js FS | 定位并检查后端可执行文件。 | `resolveBackendPath`、`assertBackendIsExecutable`；支持开发覆盖和打包 resources 路径。 |
| [`backendResponse.ts`](./backendResponse.ts) | TypeScript Runtime Guard | 验证 C++ 响应并转换公开 DTO。 | `parseBackendResponse`、`formatBackendError`；检查节点、逻辑结构、项目版本和错误代码。 |

## 开发与验证

- 修改协议字段时必须同时更新 C++ 后端、[`../../shared/engineProtocol.ts`](../../shared/engineProtocol.ts)、响应校验与集成测试。
- 快速验证可运行 `pnpm --dir apps/editor exec vitest run tests/unit/backendResponse.test.ts tests/unit/backendClientTimeout.test.ts`；真实协议使用 `pnpm --dir apps/editor test:integration`。
