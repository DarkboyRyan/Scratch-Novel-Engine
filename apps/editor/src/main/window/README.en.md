# Window management

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Each `EditorWindowContext` owns its backend, project, preview and file-operation coordinator. IPC resolves services from the sending window. `FileOperationCoordinator.runExclusive` serializes file operations within that window; release the promise chain on every exit path.

Placement helpers calculate visible cascaded positions. Session changes update the native title, represented filename and edited flag. Destroy contexts and resources when windows close, and never share mutable project sessions across windows.

## Navigation

- [`EditorWindowContext.ts`](./EditorWindowContext.ts)
- [`FileOperationCoordinator.ts`](./FileOperationCoordinator.ts)
- [`editorWindowPlacement.ts`](./editorWindowPlacement.ts)
- [`updateWindowDocumentPresentation.ts`](./updateWindowDocumentPresentation.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/editorWindowPlacement.test.ts tests/unit/projectFileSession.test.ts
pnpm --dir apps/editor typecheck
```
