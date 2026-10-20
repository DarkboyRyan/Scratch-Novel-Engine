# Main security boundary

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`editorFrameTrust.ts` checks window ownership, main-frame identity and the expected development or packaged Editor URL before allowing privileged IPC. Correctly typed parameters alone do not establish trust.

Do not authorize requests using only a URL string, sender or TypeScript type. Navigation and child-frame cases must remain rejected.

## Navigation

- [`editorFrameTrust.ts`](./editorFrameTrust.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/editorFrameTrust.test.ts tests/unit/registerEngineIpc.test.ts
```
