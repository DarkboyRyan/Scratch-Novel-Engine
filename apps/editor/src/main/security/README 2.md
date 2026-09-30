# Main 安全边界

[返回 Electron Main](../README.md)

本目录判断一条 IPC 调用是否确实来自当前 Editor 文档。类型正确的参数并不代表调用可信，因此所有特权处理器还必须校验窗口、Frame 身份和加载位置。

## 架构位置与工作方式

1. IPC 注册器把 Electron 事件中的 `senderFrame` 和预期 Editor 窗口交给信任检查。
2. `editorFrameTrust.ts` 同时比较窗口归属、主 Frame 身份以及开发或打包入口 URL。
3. 只有完全匹配的调用才能继续进入参数验证和业务服务，其余请求直接拒绝。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`editorFrameTrust.ts`](./editorFrameTrust.ts) | Electron WebFrameMain、URL | 阻止非 Editor 页面调用特权 IPC。 | `isSameEditorLocation`、`isTrustedEditorFrame`；同时校验窗口 ID、Frame 身份和文档 URL。 |

## 开发与验证

- 不要仅凭 URL 字符串、`sender` 或 TypeScript 类型放行 IPC；导航与子 Frame 场景必须保持拒绝策略。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorFrameTrust.test.ts tests/unit/registerEngineIpc.test.ts`。
