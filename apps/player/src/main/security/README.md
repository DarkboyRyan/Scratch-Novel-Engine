# Player Security

[返回 Player Main](../README.md)

这里定义 IPC 发送帧的信任判断。仅比较“某个请求是否来自 Main 为该 `webContents` 登记的 Player 页面”，不承担参数 Schema 或业务授权；后两项由 IPC 注册器和窗口上下文继续验证。

`isTrustedPlayerFrame` 同时核对 sender、主 frame 与规范化入口 URL，避免子 frame、导航后的页面或另一个窗口复用受信调用。开发服务器 URL 与打包后的本地入口都必须经过同一位置比较逻辑。

任何放宽都需要说明新的受信来源，并在 `registerPlayerIpc.test.ts` 中覆盖错误窗口、错误 frame、错误 URL 与导航场景。不要以字符串前缀、来源可控 query 或仅 channel 名作为信任依据。

```bash
pnpm --dir apps/player exec vitest run tests/unit/registerPlayerIpc.test.ts
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`playerFrameTrust.ts`](./playerFrameTrust.ts) | Electron WebFrame | 比对窗口、URL 与发送帧身份 | `isSamePlayerLocation`、`isTrustedPlayerFrame` |
