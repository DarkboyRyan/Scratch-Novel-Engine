# Player IPC

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This is the dispatch point for allowlisted Preload requests into Main services. Requests share the `vn-player:request` channel, with discriminated actions and exact parameters. Unknown fields and incorrect types are rejected.

The registrar validates the window and sending frame, checks the payload, and retrieves the window services. Save requests capture game identity and session generation; if the game changes during an operation, stale requests are rejected with a stable error.

New actions require updates to the shared protocol, Preload, Gateway, validation, and tests. Do not accept arbitrary objects, disk paths supplied by the interface, or asset identifiers without length limits.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run tests/unit/registerPlayerIpc.test.ts
```

## Source files

- [`registerPlayerIpc.ts`](./registerPlayerIpc.ts)
