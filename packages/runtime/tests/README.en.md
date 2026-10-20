# Runtime Tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Tests construct `ProjectDocument` directly to check states, errors, and snapshot round trips without Electron or a browser.

- [`gameRuntime.contract.test.ts`](./gameRuntime.contract.test.ts): dialogue, media, choices, logic, loops, CG, scales, and character events.
- [`gameRuntimeSnapshot.test.ts`](./gameRuntimeSnapshot.test.ts): Snapshot v1–v5 validation, restoration, and legacy scale defaults.
- [`logicValidation.test.ts`](./logicValidation.test.ts): variables, UTF-8 byte limits, nesting, and project budgets.
- [`characterEffect.test.ts`](./characterEffect.test.ts): fields, duration, intensity, and direction for seven effects.

```sh
pnpm --dir packages/runtime test
```

The command compiles the test scope with `tsconfig.test.json`, then runs Vitest. Regression cases should assert runtime state directly and cover malformed input and budget limits.
