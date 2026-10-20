# Editor integration tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

These tests exercise real boundaries: Main-to-C++ JSONL and Editor export-to-Player compatibility. The integration command builds `vn_engine_backend` with CMake before Vitest starts subprocesses and temporary outputs.

`backendProtocol.test.ts` covers commands, transactions, structure and errors across project and story operations. `runtimeBundlePlayerCompatibility.test.ts` compiles Author v22, exports Runtime v13 and loads it through Player Loader and `startGame`, including page styles, English default language and non-default image scales.

Give each test isolated temporary directories and processes, including cleanup after failure. Update assertions for backend, author/runtime format, export layout or Player Loader changes. A direct single-file run still requires a built backend.

## Navigation

- [`backendProtocol.test.ts`](./backendProtocol.test.ts)
- [`runtimeBundlePlayerCompatibility.test.ts`](./runtimeBundlePlayerCompatibility.test.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor test:integration
```
