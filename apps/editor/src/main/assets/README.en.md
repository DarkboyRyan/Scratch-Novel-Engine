# Asset previews

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`AssetPreviewService.ts` serves managed project media through `vn-asset://` without exposing local paths. It verifies the project session, canonical path, file identity, content signature, size and byte range before streaming data.

Renaming updates private display metadata. Successful deletion rotates the capability generation before IPC returns; project switches and window closure also invalidate old URLs. Never accept arbitrary absolute paths or trust extensions alone. Range requests must be bounded and single-part.

## Navigation

- [../media](../media/README.en.md)
- [`AssetPreviewService.ts`](./AssetPreviewService.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/assetPreviewService.test.ts tests/unit/mediaPolicy.test.ts
```
