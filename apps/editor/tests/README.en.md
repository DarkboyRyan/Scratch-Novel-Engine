# Editor tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Vitest covers fast unit and lightweight interaction tests; React interactions use Testing Library and JSDOM. Integration tests use a real C++ backend or read Editor exports through Player Loader.

Place regressions at the smallest useful boundary. Use integration tests for real processes, publication and cross-application contracts. The complete `test` command builds and tests C++ before running all Vitest cases; `test:integration` runs the integration layer. Use `test:watch` for local iteration.

## Navigation

- [./unit](./unit/README.en.md)
- [./integration](./integration/README.en.md)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/<file>.test.ts
pnpm --dir apps/editor test:watch
pnpm --dir apps/editor test
pnpm --dir apps/editor test:integration
```
