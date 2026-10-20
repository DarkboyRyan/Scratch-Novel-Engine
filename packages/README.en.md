# Shared Packages

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

These platform-independent modules are shared by Editor, Desktop Player, and Web Player.

- [Runtime](./runtime/README.en.md): story state transitions, logic, CG, character state, and snapshots.
- [Player UI](./player-ui/README.en.md): title screens, stages, dialogue, options, CG, and media components.

Loader/Compiler normalizes external formats into `ProjectDocument`. Runtime processes progression events; UI displays state and returns interactions. Hosts own files, IPC, media URLs, windows, and save storage.

```sh
pnpm --dir packages/runtime typecheck
pnpm --dir packages/runtime test
pnpm --dir packages/player-ui typecheck
```

Check Editor and Player after public type changes. Keep historical format migration at the Loader/Compiler boundary.
