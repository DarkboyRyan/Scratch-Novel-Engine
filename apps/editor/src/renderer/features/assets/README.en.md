# Asset management

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`AssetManager` is a workspace alongside story editing. It supports import, type filtering, Unicode-normalized name search, project or name order, details and on-demand previews. Main owns file selection, copying and content validation.

Names must be non-empty and at most 256 UTF-8 bytes. C++ resolves import collisions with ` (2)`, ` (3)` suffixes; exact same-type rename collisions return an error and preserve input. Cards expose the same rename/delete actions through right-click or Shift+F10, with focus restored on close.

Deletion is offered only for zero visible references. C++ checks the entire project, including legacy hidden references, and atomically rejects any referenced asset. Logical deletion affects the snapshot and next saved manifest; physical files remain as unreferenced data pending safe garbage collection.

Images reuse resolved preview URLs; audio/video resolve only when selected. All media show loading/unavailable states. Pause and clear old sources on selection or project changes and unmount, and ignore stale asynchronous results.

`collectAssetReferences` reports readable locations in title, CG and story data without exposing IDs. Drag payloads use separate media MIME types and stable IDs, never absolute paths. `assets/images|audio|videos/<name>` strings are logical display paths and must not reach filesystem APIs. `ResourcePanel` remains a compatibility component; story scaling controls are outside the asset workspace.

## Navigation

- [assetDragTypes.ts](./assetDragTypes.ts)
- [AssetManager.tsx](./AssetManager.tsx)
- [SceneBackgroundSettings.tsx](./SceneBackgroundSettings.tsx)
- [assetReferences.ts](./assetReferences.ts)
- [logicalAssetPath.ts](./logicalAssetPath.ts)
- [ResourcePanel.tsx](./ResourcePanel.tsx)
- [useAssetPreviewUrls.ts](./useAssetPreviewUrls.ts)
- [../../../main/assets](../../../main/assets/README.en.md)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/assetManager.test.tsx tests/unit/assetReferences.test.ts
```
