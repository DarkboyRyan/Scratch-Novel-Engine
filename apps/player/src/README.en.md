# Player Source

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

The desktop and web hosts share `PlayerGateway` and the React interface. Desktop requests pass through Renderer, Preload, and IPC to Main. The web host implements the same interface in the browser and stores data in IndexedDB.

`main.ts` coordinates the desktop lifecycle, window services, and settings flush on exit; `preload.ts` exposes the allowlisted API. `renderer/index.tsx` and `web/index.tsx` start the same `App` for their respective hosts.

Shared modules contain only types, guards, and pure parsing logic. Express host differences through Gateway capabilities and results. Interface changes must update the protocol, IPC validation, Preload, Gateway, and tests. Keep system permissions within the host, and keep internal errors and absolute paths out of the interface.

## Directories

- [`shared`](./shared/README.en.md)
- [`main`](./main/README.en.md)
- [`renderer`](./renderer/README.en.md)
- [`web`](./web/README.en.md)

## Source files

- [`main.ts`](./main.ts)
- [`preload.ts`](./preload.ts)
- [`renderer/index.tsx`](./renderer/index.tsx)
- [`web/index.tsx`](./web/index.tsx)
