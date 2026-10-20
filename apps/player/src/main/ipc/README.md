# Player IPC

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

这是 Preload 白名单请求进入 Main 服务的分派点。请求共用 `vn-player:request` 通道，以 action 与精确 params 区分，拒绝未知字段和错误类型。

注册器先验证窗口和发送帧，再校验负载并取得窗口服务。存读档请求捕获游戏身份与会话代次；操作期间切换游戏时，过期请求以稳定错误拒绝。

新增 action 时，同步共享协议、Preload、Gateway、参数校验和测试。不要接受任意对象、界面提供的磁盘路径或没有长度限制的资源标识。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run tests/unit/registerPlayerIpc.test.ts
```

## 主要文件

- [`registerPlayerIpc.ts`](./registerPlayerIpc.ts)
