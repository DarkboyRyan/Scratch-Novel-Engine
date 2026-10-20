# Shared components

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Reusable React components include the toolbar, dialogs, error boundary and static scene preview. They receive explicit state and callbacks; App, hooks and features retain business writes and project-session ownership.

Dialogs need accessible labels, focus management and a close path. Previews resolve controlled media URLs rather than reading files. Keep single-feature components in their feature directory.

## Navigation

- [CreateProjectDialog.tsx](./CreateProjectDialog.tsx)
- [EditorSettingsDialog.tsx](./EditorSettingsDialog.tsx)
- [ErrorDialog.tsx](./ErrorDialog.tsx)
- [PreviewPanel.tsx](./PreviewPanel.tsx)
- [RendererErrorBoundary.tsx](./RendererErrorBoundary.tsx)
- [Toolbar.tsx](./Toolbar.tsx)
- [VisualStage.tsx](./VisualStage.tsx)
- [../features](../features/README.en.md)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/rendererErrorBoundary.test.tsx tests/unit/previewPanelLogicNotice.test.tsx
```
