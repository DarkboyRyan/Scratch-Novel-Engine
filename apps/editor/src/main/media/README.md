# 媒体校验

[返回 Electron Main](../README.md)

本目录提供媒体导入和预览共用的纯格式策略。它把扩展名、MIME、大小限制、文件魔数和 HTTP Range 解析分开处理，使资产入口不会仅凭文件名信任本机内容。

## 架构位置与工作方式

1. 资产导入或协议预览先依据 `MediaFormat.ts` 规范化扩展名并取得允许的类型和大小。
2. `MediaContentValidator.ts` 读取有限头部字节，确认内容魔数与声明格式一致。
3. 流式音视频请求再由 `MediaRange.ts` 解析单一字节范围，并把安全边界交给预览服务。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`MediaContentValidator.ts`](./MediaContentValidator.ts) | Node.js FileHandle、二进制解析 | 按内容确认媒体真实类型。 | `mediaMagicMatches`；识别 JPEG/PNG/WebP、MP3/Ogg/WAV、MP4/WebM。 |
| [`MediaFormat.ts`](./MediaFormat.ts) | TypeScript、Path | 统一资产扩展名、MIME 和大小限制。 | `canonicalAssetExtension`、`previewMimeForAsset`、`maximumPreviewBytes`。 |
| [`MediaRange.ts`](./MediaRange.ts) | TypeScript | 解析单段 HTTP Range。 | `parseSingleByteRange` 支持闭合、开放和后缀范围并拒绝多段请求。 |

## 开发与验证

- 新增格式时应同时定义规范扩展名、MIME、大小上限和魔数规则；不要放宽多段 Range 或越界读取。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/mediaPolicy.test.ts tests/unit/assetPreviewService.test.ts` 验证策略及调用方。
