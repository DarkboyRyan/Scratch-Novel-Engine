# Player Window

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Window contexts bind IPC requests to the correct content session, save store, and settings controller. They are indexed by `webContents.id`, registered when windows are created, and removed on destruction.

Content sessions and settings controllers are per-window; underlying persistent stores can be shared. When adding a window service, update creation, cleanup, and IPC tests together. Avoid a global current window or identifiers that the page can forge.

## Source files

- [`PlayerWindowContext.ts`](./PlayerWindowContext.ts)
