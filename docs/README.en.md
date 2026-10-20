# Technical documentation

[中文](./README.md) | **English**

These guides cover cross-module design and feature implementation. Start with architecture and project storage, then look up the feature you need. Source-directory READMEs provide local development entry points and validation commands.

The current data formats are Author v22, Runtime v13, and Snapshot v5. Author and Runtime readers support v1–v22 and v1–v13 respectively. See the relevant guides for migration rules and constraints.

The linked technical guides are currently in Chinese.

## Architecture and projects

- [Architecture and process boundaries](./architecture.md)
- [Code organization, shared packages, and dependencies](./code-organization-and-decoupling.md)
- [Project folders, media assets, and secure file access](./project-folder-storage.md)
- [Technology stack and design decisions](./technical-stack-interview-guide.md)

## Authoring and stories

- [Undo, redo, save points, and crash recovery](./editor-history-and-recovery.md)
- [Full previews and story execution](./game-preview-runtime.md)
- [Code editing, page styles, and the restricted DSL](./code-section-technical-stack.md)
- [Variables, conditions, and loop blocks](./logic-blockly-implementation.md)
- [In-story CG display and timing](./cg-display-blockly-implementation.md)
- [CG gallery, pagination, and image viewing](./cg-gallery-implementation.md)
- [Character portraits and story image scaling](./character-portrait-implementation.md)
- [Character portrait effects](./character-portrait-effects.md)
- [Choices and branching](./choice-branch-implementation.md)
- [Scene transitions](./scene-jump-implementation.md)
- [Voice and background music](./audio-implementation.md)
- [Video playback](./video-playback-block.md)

## Players and releases

- [Desktop bundles and standalone game export](./game-export-player.md)
- [Web player export and deployment](./web-player-export.md)
- [Saves and snapshots](./save-load-implementation.md)
- [Player language, volume, and display settings](./player-options-implementation.md)
- [Editor language, themes, and settings synchronization](./editor-localization-implementation.md)
- [Editor installer builds and releases](./editor-release.md)

## Maintenance

- Use Scratch Novel Engine as the product name. Preserve compatibility identifiers such as `@vnengine/*`, `window.vnEngine`, `vn_engine_*`, `vn-engine-*`, `.vnengine`, and `VN Engine Player` in code.
- Update documentation when code, protocols, or security boundaries change. Distinguish current formats from historical versions.
- Use relative links, avoid local paths and build artifacts, and remove duplicate copies while preserving information unique to each guide.

[Back to the project](../README.en.md)
