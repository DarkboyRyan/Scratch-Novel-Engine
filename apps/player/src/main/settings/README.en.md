# Player Settings

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This module persists language, volume, window mode, and size presets, then applies display settings to native windows. `PlayerSettingsStore` validates versioned JSON, writes through temporary files and atomic renames, and tries a backup when the primary file is unavailable.

Missing or corrupt settings, and V1 settings without a language field, return the `default` language source. V2 settings return `stored`; legacy numeric settings are preserved. Renderer uses the current bundle language for the default source and persists that effective language with the first explicit settings update. Native window events do not turn defaults into player preferences.

`PlayerSettingsManager` serializes changes and follows native window state. New windows restore size, load the page, restore fullscreen, and then appear. The quit coordinator merges concurrent exit requests and waits for pending writes before quitting once. New fields require updates to protocols, migrations, storage, consumers, and tests.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerSettingsProtocol.test.ts \
  tests/unit/playerSettingsStore.test.ts \
  tests/unit/playerSettingsManager.test.ts \
  tests/unit/playerSettingsQuitCoordinator.test.ts
```

## Source files

- [`PlayerSettingsManager.ts`](./PlayerSettingsManager.ts)
- [`PlayerSettingsQuitCoordinator.ts`](./PlayerSettingsQuitCoordinator.ts)
- [`PlayerSettingsStore.ts`](./PlayerSettingsStore.ts)
