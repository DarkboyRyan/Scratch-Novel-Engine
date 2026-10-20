# Player Tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Player tests have two groups: `unit` uses Vitest for application code, while `scripts/tests` uses `node:test` for release tools. The `test` command runs both groups.

Security tests use temporary directories, real files, hashes, and streams where possible. Interface tests inject `PlayerGateway` and check observable behavior. Cover success, cancellation, rejection, stale asynchronous results, and isolation between games where applicable. Never use real user saves, settings, or signing keys.

## Run and verify

```bash
pnpm --dir apps/player test
pnpm --dir apps/player exec vitest run
pnpm --dir apps/player test:release-tools
```

## Directories

- [`unit`](./unit/README.en.md)
- [`tests`](../scripts/tests/README.en.md)
