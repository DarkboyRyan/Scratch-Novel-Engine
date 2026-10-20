# Editor settings

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Settings are separate from game projects. `EditorSettingsStore` validates and persists versioned documents with temporary-file sync and atomic rename. `EditorSettingsManager` caches valid settings and broadcasts cloned values.

The exact v2 document contains `settingsVersion: 2`, `language: 'zh-CN' | 'en-US'` and `colorTheme: 'daylight' | 'moonlight'`. Missing or unrecoverable settings default to Chinese and Daylight. Exact v1 documents preserve language and gain Daylight in memory; the next successful write publishes v2.

Renderer may submit only `{ language }` or `{ colorTheme }`, one field at a time, with no version, path or unknown keys. Main supplies the language for Runtime v13 `game.defaultLanguage`. Color theme affects Editor UI only and is excluded from Author, Runtime and exported games.

## Navigation

- [`EditorSettingsManager.ts`](./EditorSettingsManager.ts)
- [`EditorSettingsStore.ts`](./EditorSettingsStore.ts)
- [`../../shared/editorSettingsProtocol.ts`](../../shared/editorSettingsProtocol.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/editorSettingsProtocol.test.ts tests/unit/editorSettingsManager.test.ts tests/unit/editorSettingsStore.test.ts tests/unit/registerEditorSettingsIpc.test.ts
```
