# React hooks

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Shared hooks own platform subscriptions, asynchronous requests and engine-session state. `useEditorSettings` reads and subscribes to language/theme settings, applies optimistic updates and restores Main-owned values after failure. `useEngineProject` manages loading, refresh, revisions, errors and save status.

Handle unmount, request reordering and subscription cleanup. Do not infer authoritative revisions or dirty state from optimistic local changes alone. Return stable actions and explicit results so App can coordinate save, export and errors.

## Navigation

- [useEditorSettings.ts](./useEditorSettings.ts)
- [useEngineProject.ts](./useEngineProject.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/useEditorSettings.test.tsx tests/unit/useEngineProject.test.tsx
```
