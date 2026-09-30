# Player Media

[返回 Player Main](../README.md)

媒体模块让沙箱化 Renderer 可以播放当前游戏的图片、音频和视频，同时不暴露磁盘路径。桌面版使用受控的 `vn-game-asset://` 协议，每个 URL 都绑定当前 Bundle generation 和随机资源令牌。

## 请求流程

Bundle 激活后，`PlayerMediaService` 根据资源 ID 签发短期 URL。协议请求到达时，服务再次核对 scheme、媒体类别、generation、令牌和请求方法，并通过安全文件 API 重新确认真实路径、文件快照、大小、MIME 与魔数。音频和视频支持单段 byte range，图片只返回完整内容；切换游戏、关闭窗口或销毁服务会终止活动流并使旧 URL 立即失效。

`mediaPolicy.ts` 是允许格式与大小上限的权威来源，`mediaRange.ts` 只解析受支持的单区间语义。新增格式必须同时更新共享媒体契约、文件魔数策略、Loader 和测试，不能仅依赖扩展名或浏览器提供的 MIME。

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerMediaPolicy.test.ts \
  tests/unit/playerMediaService.test.ts
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerMediaService.ts`](./PlayerMediaService.ts) | Electron Protocol、Streams | 为当前游戏提供令牌化媒体 URL 与流式响应 | `PlayerMediaService`、`PLAYER_MEDIA_SCHEME` |
| [`mediaPolicy.ts`](./mediaPolicy.ts) | Node.js Buffer | 按 MIME 和魔数识别图片、音频、视频 | `playerMediaMagicMatches`、格式解析器 |
| [`mediaRange.ts`](./mediaRange.ts) | TypeScript | 解析 HTTP 单字节区间 | `parsePlayerByteRange` |
