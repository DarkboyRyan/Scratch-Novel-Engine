# Scratch Novel Engine

[中文](./README.md) | **English**

Scratch Novel Engine is a visual novel creation tool. Write stories using forms, Blockly blocks, or code, then preview and export your game. The project is built with C++20, TypeScript, React, and Electron.

> **Project status: Waiting for the professor’s feedback before making further revisions.**

## Features

- Write dialogue, set up choices and variables, connect scenes, and manage images, audio, and video.
- Preview stories and customize the title screen, character presentation, and CG gallery.
- Undo and redo edits, and recover your work after a crash.
- Export content bundles for the desktop player, a Web player, or standalone games.
- Use the editor and players in Chinese or English.

## Quick start

Requires Node.js 24, pnpm 11.18.0, CMake 3.20+, and a C++20 compiler. An internet connection is needed to fetch dependencies on the first build.

Run from the project root:

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/editor start
```

The start command builds the C++ backend, prepares the Player template, and opens the editor. The first launch takes longer.

## Documentation and source

| Entry | Contents |
| --- | --- |
| [Editor](./apps/editor/README.en.md) | Editor development and validation |
| [Player](./apps/player/README.en.md) | Desktop and Web players |
| [C++ Core](./engine/README.en.md) | Visual novel projects, data validation, and backend |
| [Runtime](./packages/runtime/README.en.md) / [Shared UI](./packages/player-ui/README.en.md) | Story execution and player interfaces |
| [Examples](./examples/README.en.md) | Sample projects |
| [Technical documentation](./docs/README.en.md) | Architecture, data formats, and implementation details |
| [Editor releases](./docs/editor-release.md) | Installer builds and publishing |

The editor defaults to English on first launch. Switch to Chinese in Settings; your language preference is saved. Module READMEs are available in both languages; detailed technical guides are currently in Chinese.
