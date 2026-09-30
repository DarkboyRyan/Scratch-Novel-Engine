# Player IPC

[返回 Player Main](../README.md)

IPC 模块是 Preload 白名单调用进入 Main 服务的唯一分派点。所有功能共用 `vn-player:request` 通道，但每次调用都携带判别式 action 和精确 params，便于集中拒绝未知字段与错误类型。

## 请求处理

`registerPlayerIpc` 先确认事件来自已登记 Player 窗口及可信 frame，再用共享协议守卫验证负载，最后从 `PlayerWindowContexts` 取得该窗口的内容、存档和设置服务。存读档操作会捕获当前游戏身份与 generation；若用户在异步操作期间切换了 Bundle，结果以 stale session 拒绝，避免跨游戏写入。

新增 action 时必须从 [`../../shared/playerProtocol.ts`](../../shared/playerProtocol.ts) 开始定义类型，并同步更新 Preload、Gateway、精确字段校验和 `registerPlayerIpc.test.ts`。不得接受任意对象、Renderer 提供的磁盘路径或未限制长度的资源标识。

```bash
pnpm --dir apps/player exec vitest run tests/unit/registerPlayerIpc.test.ts
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`registerPlayerIpc.ts`](./registerPlayerIpc.ts) | Electron IPC、TypeScript | 校验可信来源和调用负载并分派服务 | `registerPlayerIpc`、`isPlayerInvocation` |
