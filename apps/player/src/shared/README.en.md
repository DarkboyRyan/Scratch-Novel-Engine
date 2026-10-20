# Player Shared

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This is the protocol and parsing layer shared by Main, Preload, Renderer, release scripts, and the web host. It contains types, constants, guards, and side-effect-free logic.

`playerProtocol.ts` defines IPC, public game views, error codes, settings, and save results. Settings include a `default`/`stored` language source so the interface can distinguish bundle defaults from player preferences. Disk paths, hashes, and internal errors are private.

`runtimeBundleSchema.ts` strictly parses bundles: the writer uses v13 and the reader supports v1–v13. Version 11 introduced integer image scales from 10% to 300%, v12 requires `defaultLanguage`, and v13 requires title and gallery styles. Older versions receive defaults. Media contracts share directory, MIME, and size rules; the web export protocol also constrains descriptors and game roots.

New fields need a version change or a tested migration. Continue rejecting unknown fields. Apart from Window type declarations, shared modules must not depend on Electron, Node, React, or browser globals.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerSettingsProtocol.test.ts \
  tests/unit/playerBundleLoader.test.ts \
  tests/unit/webExportProtocol.test.ts
pnpm --dir apps/player typecheck
```

## Source files

- [`global.d.ts`](./global.d.ts)
- [`playerMediaContract.ts`](./playerMediaContract.ts)
- [`playerProtocol.ts`](./playerProtocol.ts)
- [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts)
- [`webExportProtocol.ts`](./webExportProtocol.ts)
