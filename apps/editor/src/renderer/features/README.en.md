# Feature modules

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Features organize code by authoring capability: assets, Blockly stories, CG gallery, Code, forms, game preview and title screen. Each feature projects the author project into UI state and submits edits through Application actions.

The author project remains authoritative. Local selections and drafts are temporary and must reconcile with successful updates. Move shared behavior into Application, components or hooks instead of creating reverse dependencies between features.

## Navigation

- [./assets](./assets/README.en.md)
- [./block-editor](./block-editor/README.en.md)
- [./cg-gallery](./cg-gallery/README.en.md)
- [./code-editor](./code-editor/README.en.md)
- [./form-editor](./form-editor/README.en.md)
- [./game-preview](./game-preview/README.en.md)
- [./start-screen](./start-screen/README.en.md)
- [../application](../application/README.en.md)
- [../components](../components/README.en.md)
- [../hooks](../hooks/README.en.md)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor typecheck
```
