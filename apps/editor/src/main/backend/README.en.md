# Backend sessions

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Each window owns a C++ JSONL session. `backendPath.ts` locates and checks the development or packaged executable. `backendClient.ts` correlates requests and responses, handles timeouts and unexpected exits, and obtains save snapshots. `backendResponse.ts` validates untrusted process output before exposing Shared DTOs.

Protocol changes require matching updates to the C++ backend, `../../shared/engineProtocol.ts`, response guards and integration tests.

## Navigation

- [`backendClient.ts`](./backendClient.ts)
- [`backendPath.ts`](./backendPath.ts)
- [`backendResponse.ts`](./backendResponse.ts)
- [`../../shared/engineProtocol.ts`](../../shared/engineProtocol.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/backendResponse.test.ts tests/unit/backendClientTimeout.test.ts
pnpm --dir apps/editor test:integration
```
