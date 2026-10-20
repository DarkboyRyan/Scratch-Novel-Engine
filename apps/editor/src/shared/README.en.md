# Shared process contracts

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Shared contains browser-safe IPC channels, DTOs, global APIs, guards and pure project conversions. It must not import Electron, Node, Main services or React components, or expose arbitrary host paths. Preload maps contracts to minimal Window APIs; Main still performs runtime validation.

Story-image scaling reuses `@vnengine/runtime` constants and guards: integer 10–300%, with absent backgrounds and cleared portraits normalized to 100%. Story Code sends strict `SceneContentDraft` data through `scene.content.replace`; hidden markers and new IDs stay in C++. Preload requires `storyCodeContractVersion: 1` to avoid sending new drafts to stale Main code during HMR.

Main persists exact EditorSettings v2 language/theme documents; v1 retains language and gains Daylight. Runtime v13 retains the v12 `game.defaultLanguage` field, supplied by Main during export rather than Renderer export parameters. Author text stays unchanged, and Editor theme is excluded from Author and Runtime.

Contract changes require matching Main guards, Preload wrappers, Renderer gateways and tests. Static typing alone does not validate untrusted input.

## Navigation

- [`global.d.ts`](./global.d.ts)
- [`assetProtocol.ts`](./assetProtocol.ts)
- [`editorSettingsProtocol.ts`](./editorSettingsProtocol.ts)
- [`engineProtocol.ts`](./engineProtocol.ts)
- [`exportIpcChannel.ts`](./exportIpcChannel.ts)
- [`exportProtocol.ts`](./exportProtocol.ts)
- [`filenamify-browser.d.ts`](./filenamify-browser.d.ts)
- [`projectFileProtocol.ts`](./projectFileProtocol.ts)
- [`projectTypes.ts`](./projectTypes.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor exec vitest run tests/unit/editorSettingsProtocol.test.ts tests/unit/validateEngineInvocation.test.ts
```
