# Player IPC

[返回 Player Main](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`registerPlayerIpc.ts`](./registerPlayerIpc.ts) | Electron IPC、TypeScript | 校验可信来源和调用负载并分派服务 | `registerPlayerIpc`、`isPlayerInvocation` |
