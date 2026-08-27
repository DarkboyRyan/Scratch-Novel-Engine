# C++ 后端桥接

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`backendClient.ts`](./backendClient.ts) | Node.js Child Process、Readline | 管理窗口独占的 C++ JSONL 会话。 | `BackendClient`、`backendRequestTimeoutMs`；请求关联、超时、异常退出与保存快照处理。 |
| [`backendPath.ts`](./backendPath.ts) | Electron app、Node.js FS | 定位并检查后端可执行文件。 | `resolveBackendPath`、`assertBackendIsExecutable`；支持开发覆盖和打包 resources 路径。 |
| [`backendResponse.ts`](./backendResponse.ts) | TypeScript Runtime Guard | 验证 C++ 响应并转换公开 DTO。 | `parseBackendResponse`、`formatBackendError`；检查节点、逻辑结构、项目版本和错误代码。 |
