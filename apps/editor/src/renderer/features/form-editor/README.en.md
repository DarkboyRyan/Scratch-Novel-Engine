# Form editor

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

The form editor combines scenes, a timeline, an inspector and static previews. `useFormEditor.ts` owns selection, scene-name/dialogue drafts and authoring actions. `formLogicTree.ts` builds readable branches and safe movement anchors; `timelinePreview.ts` derives background, portrait, CG and media state from the selected timeline position.

Add backgrounds explicitly through the timeline. Rename scenes by double-click or F2; Enter/blur commits and Escape cancels. Save, preview, export, scene changes and mode changes flush pending dialogue and scene-name drafts.

A CG root, its dialogue body and hidden end marker form one atomic range. Move the root as a whole; reorder internal dialogue only inside the body. Ordinary nodes must cross the complete CG range. Adding a portrait after dialogue inside a CG places it after that range. Do not silently rewrite unsupported logic; keep it visible or explicitly read-only.

## Navigation

- [FormEditor.tsx](./FormEditor.tsx)
- [formLogicTree.ts](./formLogicTree.ts)
- [InspectorPanel.tsx](./InspectorPanel.tsx)
- [ScenePanel.tsx](./ScenePanel.tsx)
- [timelinePreview.ts](./timelinePreview.ts)
- [useFormEditor.ts](./useFormEditor.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/formLogicTree.test.ts tests/unit/timelinePreview.test.ts tests/unit/formChoiceCompatibility.test.tsx
```
