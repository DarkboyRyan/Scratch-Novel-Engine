# Player Security

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`isTrustedPlayerFrame` checks whether an IPC request comes from the Player page registered by Main for that window. It verifies the sender, main frame, and normalized entry URL. The IPC registrar and window context handle parameter validation and business authorization.

Development and packaged entries use the same location-comparison rules. Do not establish trust from URL prefixes, page-controlled query values, or channel names. Changes to trusted sources need tests for wrong windows, child frames, wrong URLs, and requests after navigation.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run tests/unit/registerPlayerIpc.test.ts
```

## Source files

- [`playerFrameTrust.ts`](./playerFrameTrust.ts)
