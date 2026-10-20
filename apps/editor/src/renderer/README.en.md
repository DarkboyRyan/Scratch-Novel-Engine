# Renderer

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Renderer is the sandboxed React interface. `index.tsx` mounts the app and styles; `App.tsx` coordinates project sessions, editing modes, previews and dialogs, and applies language and color theme to the document root.

Hooks read settings and session state. Application actions adapt UI intent to typed engine and platform calls. Features rebuild their projections after authoritative project updates. Renderer must remain browser-safe: do not import Node, Main implementations or host APIs outside gateways. Keep project ownership in App, hooks or features rather than display components.

## Navigation

- [`index.tsx`](./index.tsx)
- [`App.tsx`](./App.tsx)
- [./hooks](./hooks/README.en.md)
- [./application](./application/README.en.md)
- [./components](./components/README.en.md)
- [./features](./features/README.en.md)
- [./i18n](./i18n/README.en.md)
- [./styles](./styles/README.en.md)
- [App.tsx](./App.tsx)
- [index.tsx](./index.tsx)
- [projectSavePreparation.ts](./projectSavePreparation.ts)
- [projectSessionPresentation.ts](./projectSessionPresentation.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor lint
pnpm --dir apps/editor typecheck
```
