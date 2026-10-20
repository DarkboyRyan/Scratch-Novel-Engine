# Title screen

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Form and fixed-structure Blockly edit title eyebrow text, game name, background and looping music. Code separately updates `startScreen.style` through a restricted DSL. Navigation helpers distinguish title, CG and story surfaces.

The eyebrow defaults to `A VN ENGINE STORY`; an empty string hides it. Submission trims ASCII whitespace and rejects NUL or more than 256 UTF-8 bytes. Form `maxLength=256` is only an interaction aid; C++ Core, Author Compiler and Player Reader enforce the byte limit.

Preserve equivalence between form and Blockly, and protect managed root blocks from deletion or arbitrary reordering. Navigation IDs must not collide with story scenes. Styles accept only shared DTO font, color, opacity, radius, layout and background-fit values; never execute raw CSS or JavaScript.

## Navigation

- [startScreenBlockEvents.ts](./startScreenBlockEvents.ts)
- [StartScreenBlocklyWorkspace.tsx](./StartScreenBlocklyWorkspace.tsx)
- [startScreenBlocks.ts](./startScreenBlocks.ts)
- [StartScreenEditor.tsx](./StartScreenEditor.tsx)
- [StartScreenFormEditor.tsx](./StartScreenFormEditor.tsx)
- [startScreenScene.ts](./startScreenScene.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/startScreenEditor.test.tsx tests/unit/startScreenResponsiveStyle.test.ts
```
