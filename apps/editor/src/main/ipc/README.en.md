# IPC entry points

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This is Renderer’s request boundary for privileged Main operations. Every handler verifies the calling frame and exact argument shape before finding its window context and invoking a service. Reject unknown keys, invalid enums and out-of-range data; do not accept arbitrary local paths.

The `register*Ipc` modules cover assets, settings, engine commands, export and project files. Asset deletion revokes preview capabilities and updates window state. Settings accept narrow patches and broadcast changes across windows.

A new endpoint needs a Shared contract, Preload method, frame check, runtime argument guard and tests. Run integration tests when changing project formats or real backend commands.

## Navigation

- [`registerAssetIpc.ts`](./registerAssetIpc.ts)
- [`registerEditorSettingsIpc.ts`](./registerEditorSettingsIpc.ts)
- [`registerEngineIpc.ts`](./registerEngineIpc.ts)
- [`registerExportIpc.ts`](./registerExportIpc.ts)
- [`registerProjectFileIpc.ts`](./registerProjectFileIpc.ts)
- [`validateAssetInvocation.ts`](./validateAssetInvocation.ts)
- [`validateEngineInvocation.ts`](./validateEngineInvocation.ts)
- [`validateExportInvocation.ts`](./validateExportInvocation.ts)
- [`validateProjectFileInvocation.ts`](./validateProjectFileInvocation.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/validateEngineInvocation.test.ts tests/unit/registerEngineIpc.test.ts
pnpm --dir apps/editor test:integration
```
