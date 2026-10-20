# Application menu

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`installApplicationMenu.ts` builds a localized native menu, preserves Electron platform roles and sends project commands to the focused Editor window. Renderer then uses the normal project-file API; the menu does not implement file workflows.

Keep event names aligned with Shared and Preload subscriptions, and preserve native macOS, Windows and Linux conventions.

## Navigation

- [../i18n](../i18n/README.en.md)
- [`installApplicationMenu.ts`](./installApplicationMenu.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/installApplicationMenu.test.ts tests/unit/editorNativeLabels.test.ts
```
