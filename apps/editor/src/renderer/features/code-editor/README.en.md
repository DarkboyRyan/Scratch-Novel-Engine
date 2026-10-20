# Code editor

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Code provides editable story DSL and restricted title/CG style DSL. All views share one authoritative Author Project; source text is a projection or window-local draft, never a second saved project.

## Story editing

`projectSceneToReadonlyCode` projects the current scene; `parseEditableSceneCode` strictly parses the closed grammar. Source ranges map node and choice IDs to one-based lines, and diagnostics report broken references or hidden marker structure without repairing the project. Logic and CG projection reuse `block-editor/logicStructure`.

```text
story 1

scene("Wake Up") {
  background(image("assets/images/Bedroom"), scale: 80, initial: true)
  say("What happened?", speaker: "Gregor")
  show(image("assets/images/Gregor"), at: right, layer: 2, scale: 90, effect: shake(600ms, normal))
}
```

Asset strings are readable logical paths derived from public media types and display names, not asset IDs or filesystem paths. Applying Code sends only a typed `SceneContentDraft` to `scene.content.replace`. C++ builds a candidate project, reuses provable identities, assigns new IDs, reconstructs If/Repeat/CG markers and commits only after full validation. Failure and semantic no-op create no partial timeline or extra revision.

Invalid syntax, ambiguous names and conflicts remain in the local draft. Form and Blockly continue to show the last applied scene. Any unapplied page draft blocks save, export, preview and asset import. Drafts are excluded from Author files and cleared after confirming discard when opening another project.

Shared textarea helpers indent by two spaces with Tab, reverse-indent with Shift+Tab, preserve multiline selections and inherit indentation on Enter, including bracket expansion. IME composition and Ctrl/Meta/Alt combinations remain intact. Press Escape, then Tab or Shift+Tab to leave the editor.

## Page styles

`surfaceStyleCode.ts` parses `main_screen(...)` and `cg_gallery(...)` into strict DTOs. Both require `style_version: 1`; font is `system | serif | rounded | mono`, font scale is integer 75–150, colors are `#RRGGBB`, opacity is integer 0–100 and radius is integer 0–48 px. Color fields are `page`, `text`, `muted_text`, `surface`, `accent` and `overlay`; opacity fields are `surface_opacity` and `overlay_opacity`.

Title styles add `layout: split-right | split-left | center` and `background_fit: contain | cover`. CG styles add `layout: framed | edge-to-edge`, `thumbnail_fit: contain | cover` and `gap: 0..32`. Reject unknown, duplicate or missing fields, invalid numbers/colors, wrong wrappers and UTF-8 source larger than 16 KiB. Raw CSS, JavaScript, selectors, HTML and URLs are not accepted.

Applying styles sends only `StartScreenStyleDocument` or `CgGalleryStyleDocument`. C++ updates style without rewriting title content, media, gallery pages or slot order. External authoritative changes produce a conflict instead of overwriting a pending draft; reset uses the same strict command.

Author v22 requires both style DTOs; readers supply safe defaults for Author v1–v21. Runtime v13 exports the same DTOs to desktop/Web, with defaults for v1–v12. DSL `style_version: 1` is independent of Author/Runtime versions. Snapshot stays v5 because page style is not story progress.

## Navigation

- [Code section technical notes (Chinese)](../../../../../../docs/code-section-technical-stack.md)
- [`CodeEditor.tsx`](./CodeEditor.tsx)
- [`sceneCodeProjection.ts`](./sceneCodeProjection.ts)
- [`sceneCodeParser.ts`](./sceneCodeParser.ts)
- [`codeFormatter.ts`](./codeFormatter.ts)
- [`codeTextareaEditing.ts`](./codeTextareaEditing.ts)
- [`surfaceStyleCode.ts`](./surfaceStyleCode.ts)
