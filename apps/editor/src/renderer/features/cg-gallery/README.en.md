# CG gallery

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Form and Blockly edit the same ordered pages, each with exactly nine explicit image slots. Empty slots and stable asset IDs survive mode switches. Code separately edits `cgGallery.style` through a restricted DSL and does not change pages or slot order.

Projection helpers build pages, slots and resource options; Blockly events and form actions submit equivalent updates. Display names may change, but persistence and event parsing must use asset IDs.

## Navigation

- [cgGalleryBlockEvents.ts](./cgGalleryBlockEvents.ts)
- [CgGalleryBlocklyWorkspace.tsx](./CgGalleryBlocklyWorkspace.tsx)
- [cgGalleryBlocks.ts](./cgGalleryBlocks.ts)
- [CgGalleryEditor.tsx](./CgGalleryEditor.tsx)
- [CgGalleryFormEditor.tsx](./CgGalleryFormEditor.tsx)
- [cgGalleryProjection.ts](./cgGalleryProjection.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/cgGalleryEditor.test.tsx
```
