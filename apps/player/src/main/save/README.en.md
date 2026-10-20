# Player Save

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Main persists desktop saves; Renderer supplies only a Runtime snapshot and slot. There are three manual slots and one quick-save slot, isolated by project ID, Runtime version, and content fingerprint.

Before writing, the store restores and normalizes the snapshot against the current project and validates media references. It then writes through restricted directories, temporary files, and atomic renames. Reads and listings validate fields, size, game identity, and snapshots too; corrupt content is never returned as partial progress.

Asynchronous operations recheck session generation before completion to prevent writes across games. Saves contain no interface text, media URLs, or disk paths. Format changes need explicit versions and a migration or rejection policy.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerSaveStore.test.ts
```

## Source files

- [`PlayerSaveStore.ts`](./PlayerSaveStore.ts)
