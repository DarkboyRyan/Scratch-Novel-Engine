# Renderer localization

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`editorLocalization.tsx` supplies complete Chinese and English label dictionaries, language normalization and React context. `useEditorSettings` obtains v2 preferences from Main; this module consumes the language field.

Only software UI is translated. Project names, titles, scene names, dialogue, speakers, choices and asset names remain unchanged. Main rereads its authoritative language during export to set Runtime v13 `game.defaultLanguage`; it does not trust Renderer state. Theme labels are localized, but theme values are not translated or exported.

Keep dictionary keys identical and check longer English text in compact toolbars, dropdowns and narrow windows.

## Navigation

- [editorLocalization.tsx](./editorLocalization.tsx)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/editorLocalization.test.tsx tests/unit/editorEnglishDensityStyle.test.ts
```
