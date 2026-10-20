# Player Build

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This module converts desktop single-game build environment variables into a product name, version, app ID, icon, and bundle path. It rejects missing, out-of-range, or platform-incompatible inputs.

Electron Forge uses `playerBuildConfig.ts` to parse configuration and verify that copied `Resources/game` content matches the intended bundle. Generic Player builds share the base configuration. This module neither generates game data nor repairs invalid inputs; Editor or CI must supply a validated bundle.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerBuildConfig.test.ts
pnpm --dir apps/player typecheck
```

## Source files

- [`playerBuildConfig.ts`](./playerBuildConfig.ts)
