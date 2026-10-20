# Player Unit Tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

These Vitest and jsdom tests cover bundle loading, IPC and media security, saves and settings, the React interface, and the web host.

File-security tests use real temporary directories; Electron and browser APIs are mocked through narrow interfaces. Interface tests assert accessible names, keyboard behavior, and visible results. CSS tests supplement them with layout and accessibility checks. Avoid assertions tied to internal call counts, random tokens, or machine-specific absolute paths.

The examples below run all tests or a single file.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run
pnpm --dir apps/player exec vitest run tests/unit/playerRenderer.test.tsx
```
