# Player Media

[返回 Player Main](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerMediaService.ts`](./PlayerMediaService.ts) | Electron Protocol、Streams | 为当前游戏提供令牌化媒体 URL 与流式响应 | `PlayerMediaService`、`PLAYER_MEDIA_SCHEME` |
| [`mediaPolicy.ts`](./mediaPolicy.ts) | Node.js Buffer | 按 MIME 和魔数识别图片、音频、视频 | `playerMediaMagicMatches`、格式解析器 |
| [`mediaRange.ts`](./mediaRange.ts) | TypeScript | 解析 HTTP 单字节区间 | `parsePlayerByteRange` |
