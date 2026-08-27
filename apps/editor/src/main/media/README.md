# 媒体校验

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`MediaContentValidator.ts`](./MediaContentValidator.ts) | Node.js FileHandle、二进制解析 | 按内容确认媒体真实类型。 | `mediaMagicMatches`；识别 JPEG/PNG/WebP、MP3/Ogg/WAV、MP4/WebM。 |
| [`MediaFormat.ts`](./MediaFormat.ts) | TypeScript、Path | 统一资产扩展名、MIME 和大小限制。 | `canonicalAssetExtension`、`previewMimeForAsset`、`maximumPreviewBytes`。 |
| [`MediaRange.ts`](./MediaRange.ts) | TypeScript | 解析单段 HTTP Range。 | `parseSingleByteRange` 支持闭合、开放和后缀范围并拒绝多段请求。 |
