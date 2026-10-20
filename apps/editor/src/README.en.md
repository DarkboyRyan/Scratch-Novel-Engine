# Editor source

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Source follows Electron process boundaries. `main.ts` assembles windows, IPC, backend and persistence services; `preload.ts` exposes a minimal typed bridge; Renderer handles editing. Entry points assemble services rather than implement business logic.

Choose Main, Renderer or Shared ownership before adding a capability. Keep Renderer browser-safe and preserve IPC boundaries.

## Navigation

- [`main.ts`](./main.ts)
- [`preload.ts`](./preload.ts)
- [./renderer](./renderer/README.en.md)
- [./main](./main/README.en.md)
- [./shared](./shared/README.en.md)
- [`preloadBundle.test.ts`](../tests/unit/preloadBundle.test.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
```
