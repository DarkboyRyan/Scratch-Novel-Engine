# Editor unit tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Vitest unit tests and JSDOM interaction tests cover Main, Preload, Shared, Renderer and Blockly. Tests target one module or user-visible interaction, including rejection paths for untrusted input. Main/export tests use temporary directories or controlled substitutes.

Coverage includes IPC trust and guards, storage, settings, media, exports, forms, Blockly, Code, assets, previews, localization and responsive styles. Test filenames follow the module under test; search by module name instead of maintaining a separate file catalogue. Real process and cross-application behavior belongs in integration tests.

## Navigation

- [../integration](../integration/README.en.md)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/timelinePreview.test.ts
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
```
