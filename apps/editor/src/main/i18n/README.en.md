# Native UI localization

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`editorNativeLabels.ts` supplies complete, typed Chinese and English labels for menus, native dialogs and window prompts. Main reads normalized `zh-CN` or `en-US` settings and rebuilds affected native UI when the language changes. React labels belong to Renderer.

Export captures the same Main-owned language in Runtime v13 `game.defaultLanguage`. This selects the initial Player UI language and does not translate author text. Keep both dictionaries structurally identical.

## Navigation

- [`editorNativeLabels.ts`](./editorNativeLabels.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/editorNativeLabels.test.ts tests/unit/installApplicationMenu.test.ts
```
