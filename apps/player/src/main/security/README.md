# Player Security

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

`isTrustedPlayerFrame` 检查 IPC 请求是否来自 Main 为该窗口登记的 Player 页面，同时核对 sender、主 frame 和规范化入口 URL。参数校验和业务授权由 IPC 注册器与窗口上下文继续处理。

开发和打包入口使用相同的位置比较逻辑。不要以 URL 前缀、页面可控的 query 或通道名作为信任依据。变更受信来源时，应覆盖错误窗口、子 frame、错误 URL 和导航后的请求。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run tests/unit/registerPlayerIpc.test.ts
```

## 主要文件

- [`playerFrameTrust.ts`](./playerFrameTrust.ts)
