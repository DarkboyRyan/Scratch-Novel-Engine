# Player Content

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Content turns disk-based `.vngame` directories into read-only game views and manages the active bundle for each window. Startup can use a development fixture, a generic player, or an embedded game. Generic mode allows local bundle selection; embedded mode rejects game replacement.

`PlayerBundleLoader` reads documents and assets through safe file APIs, checking structure, size, hashes, types, links, and path traversal. `PlayerBundleSession` switches games and rotates the media generation only after full validation. Cancellation or failure preserves the previous state, and old sessions cannot continue writing saves.

The local `runtimeBundleSchema.ts` is a compatibility re-export; the parser lives in `src/shared`. Do not duplicate parsing rules in sessions or weaken file checks to accept nonstandard directories.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerBundleLoader.test.ts \
  tests/unit/playerBundleSession.test.ts \
  tests/unit/playerStartupContent.test.ts
```

## Source files

- [`PlayerBundleLoader.ts`](./PlayerBundleLoader.ts)
- [`PlayerBundleSession.ts`](./PlayerBundleSession.ts)
- [`resolvePlayerStartupContent.ts`](./resolvePlayerStartupContent.ts)
- [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts)
- [`safeFiles.ts`](./safeFiles.ts)
- [`selectPlayerBundleDirectory.ts`](./selectPlayerBundleDirectory.ts)
