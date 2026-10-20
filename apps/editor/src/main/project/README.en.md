# Project files

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

A project directory is the persistence unit, with a fixed `project.vn.json` manifest. Main owns local paths; Renderer receives session state and controlled asset identifiers.

`ProjectFileWorkflow.ts` coordinates native dialogs, path policy, storage sessions, backend and previews. `ProjectPublisher.ts` validates a stable backend snapshot, syncs a temporary file and replaces the manifest atomically. Sessions track revisions and dirty state.

`ProjectRecoveryService.ts` keeps per-window backups and text drafts under user data. Recovery creates an unsaved project and never overwrites the original. Asset deletion currently removes references from the authoritative project and manifest but retains unreferenced disk files; it is not physical garbage collection.

Reject symlink and directory escapes. A failed save must preserve the last valid manifest and dirty state. Format changes need backend, Shared and compatibility-test updates.

## Navigation

- [`ProjectRecoveryService.ts`](./ProjectRecoveryService.ts)
- [`ProjectFileSession.ts`](./ProjectFileSession.ts)
- [`ProjectFileWorkflow.ts`](./ProjectFileWorkflow.ts)
- [`ProjectPathPolicy.ts`](./ProjectPathPolicy.ts)
- [`ProjectPublisher.ts`](./ProjectPublisher.ts)
- [`ProjectStorageSession.ts`](./ProjectStorageSession.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/projectFileSession.test.ts tests/unit/projectStorageSession.test.ts tests/unit/registerProjectFileIpc.test.ts
```
