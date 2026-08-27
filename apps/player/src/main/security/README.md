# Player Security

[返回 Player Main](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`playerFrameTrust.ts`](./playerFrameTrust.ts) | Electron WebFrame | 比对窗口、URL 与发送帧身份 | `isSamePlayerLocation`、`isTrustedPlayerFrame` |
