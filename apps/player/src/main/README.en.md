# Player Main

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Main owns desktop files, windows, media, saves, and settings. Windows start hidden and appear only after startup content has been validated and display settings restored.

`main.ts` binds a separate content session and settings controller to each `webContents`; persistent saves are isolated by game identity. IPC validates the entry URL and sending frame before dispatching requests. Asynchronous operations also check whether the game session has changed.

Media uses URLs bound to session generations and tokens, invalidated when games change or windows close. Exit waits for settings writes before session cleanup. Return only public protocol data to the interface, keeping absolute paths, hashes, internal errors, and raw capability tokens private.

## Directories

- [`build`](./build/README.en.md)
- [`content`](./content/README.en.md)
- [`ipc`](./ipc/README.en.md)
- [`media`](./media/README.en.md)
- [`save`](./save/README.en.md)
- [`security`](./security/README.en.md)
- [`settings`](./settings/README.en.md)
- [`window`](./window/README.en.md)

## Source files

- [`createPlayerWindow.ts`](./createPlayerWindow.ts)
