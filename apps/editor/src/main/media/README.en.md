# Media validation

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Media import and preview share format policy. `MediaFormat.ts` defines canonical extensions, MIME types and size limits. `MediaContentValidator.ts` checks a bounded header against JPEG/PNG/WebP, MP3/Ogg/WAV and MP4/WebM signatures. `MediaRange.ts` parses closed, open-ended and suffix byte ranges and rejects multipart requests.

New formats need all four rules: extension, MIME, size limit and content signature. Never infer trust from a filename or allow out-of-bounds reads.

## Navigation

- [`MediaContentValidator.ts`](./MediaContentValidator.ts)
- [`MediaFormat.ts`](./MediaFormat.ts)
- [`MediaRange.ts`](./MediaRange.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/mediaPolicy.test.ts tests/unit/assetPreviewService.test.ts
```
