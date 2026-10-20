# Electron Main

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Main owns host privileges: files, child processes, native menus and windows. Each window has its own backend and project session. IPC validates the calling frame and exact parameters before invoking services, then returns structured results through Shared contracts.

`createEditorWindow.ts` configures restricted navigation and window preferences. Release window-owned processes, protocol sessions and file handles when the window closes. Main must choose or resolve local paths itself.

## Navigation

- [`createEditorWindow.ts`](./createEditorWindow.ts)
- [./assets](./assets/README.en.md)
- [./backend](./backend/README.en.md)
- [./export](./export/README.en.md)
- [./i18n](./i18n/README.en.md)
- [./ipc](./ipc/README.en.md)
- [./media](./media/README.en.md)
- [./menu](./menu/README.en.md)
- [./project](./project/README.en.md)
- [./security](./security/README.en.md)
- [./settings](./settings/README.en.md)
- [./window](./window/README.en.md)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/registerEngineIpc.test.ts tests/unit/editorFrameTrust.test.ts
pnpm --dir apps/editor typecheck
```
