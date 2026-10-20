# Scratch Novel Engine Editor

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

An Electron and React visual novel editor with Blockly and a C++20 backend. Form, Blockly and Code views share the same author project. Main owns file access, media and export; Renderer uses the typed Preload API.

Story Code applies a closed DSL through atomic scene replacement. Title-screen and CG-gallery Code edits a restricted style DSL. Source text remains a window-local draft rather than a second project format.

Author v22 retains v21 story background and portrait scaling (integer 10–300%, default 100%) and adds strict page-style DTOs. Title backgrounds and CG images do not use story scaling. Export uses Runtime v13, which adds page styles without changing Snapshot v5. Main supplies `game.defaultLanguage` from Editor settings (`zh-CN` or `en-US`); this selects Player UI language and does not translate author content.

Startup reports initialization stages, not time remaining. Retry a failed connection from the startup screen. Backend compilation and Player-template preparation appear in the terminal before Electron opens; restart Editor after changing Main startup code.

Generated `.vite/`, `out/`, `dist/`, `node_modules/` and CMake build folders are not source directories.

## Navigation

- [./src](./src/README.en.md)
- [./src/main](./src/main/README.en.md)
- [./src/renderer](./src/renderer/README.en.md)
- [./src/shared](./src/shared/README.en.md)
- [./tests](./tests/README.en.md)
- [`.eslintrc.json`](./.eslintrc.json)
- [`forge.config.ts`](./forge.config.ts)
- [`forge.env.d.ts`](./forge.env.d.ts)
- [`index.html`](./index.html)
- [`package.json`](./package.json)
- [`tsconfig.json`](./tsconfig.json)
- [`vite.main.config.ts`](./vite.main.config.ts)
- [`vite.preload.config.ts`](./vite.preload.config.ts)
- [`vite.renderer.config.ts`](./vite.renderer.config.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor start
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
pnpm --dir apps/editor test
pnpm --dir apps/editor make
```
