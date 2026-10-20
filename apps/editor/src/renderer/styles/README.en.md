# Styles

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Renderer loads `base.css`, `editor.css`, then `editorTheme.css`. Base styles define semantic tokens, typography and controls; editor styles define business layouts; theme overrides refine hierarchy, density and responsiveness.

Daylight is the default cool-gray canvas with white surfaces and graphite text. Moonlight overrides the same tokens under `:root[data-editor-theme='moonlight']`. App sets the theme attribute and native color scheme. Use shared color, status, code, Blockly and surface tokens rather than duplicating component palettes.

Theme preferences affect Editor UI only, not authored Player pages, media or exported games. Scope Blockly and shared Player overrides locally. Use a 4px spacing rhythm, restrained dividers, and shadows for previews and overlays. A 3px indigo selection cue identifies the current workspace, timeline node or asset.

Preserve keyboard focus and disabled states. Fixed-height areas need `min-height: 0`, scrolling or responsive fallback. Check Chinese and English at normal and small window sizes, including reduced motion.

## Navigation

- [base.css](./base.css)
- [editor.css](./editor.css)
- [editorTheme.css](./editorTheme.css)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/editorVisualSystem.test.ts tests/unit/editorEnglishDensityStyle.test.ts tests/unit/startScreenResponsiveStyle.test.ts tests/unit/titleModalStyle.test.ts
```
