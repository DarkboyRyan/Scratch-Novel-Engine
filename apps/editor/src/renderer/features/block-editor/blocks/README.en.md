# Blockly block definitions

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This directory defines block shapes, field keys, connection types and node accessors. Persistence events belong to the parent workspace. Register block definitions and connection checks, apply localized labels, then project nodes into stable fields.

Resource-name truncation affects display only. Background and portrait scales use integer 10–300% values. Empty resources need explicit semantics; never infer identity from labels. Preserve block types, field keys and fixed IDs used by saved layouts.

Definitions cover dialogue, backgrounds, portraits and effects, BGM, video, CG dialogue containers, choices, variables, conditions, loops, jumps and continuation pages. If/Change selectors reuse project-wide Set names; prefix search ignores English case and never saves query text. Connection checks constrain effect and dialogue-only sockets while allowing valid projection restoration.

## Navigation

- [assetNameField.ts](./assetNameField.ts)
- [backgroundBlock.ts](./backgroundBlock.ts)
- [bgmBlock.ts](./bgmBlock.ts)
- [cgDisplayBlock.ts](./cgDisplayBlock.ts)
- [characterBlock.ts](./characterBlock.ts)
- [characterEffectBlock.ts](./characterEffectBlock.ts)
- [choiceBlock.ts](./choiceBlock.ts)
- [dialogueBlock.ts](./dialogueBlock.ts)
- [logicControlBlock.ts](./logicControlBlock.ts)
- [searchableVariableDropdown.ts](./searchableVariableDropdown.ts)
- [sceneJumpBlock.ts](./sceneJumpBlock.ts)
- [sceneStartBlock.ts](./sceneStartBlock.ts)
- [storyContinuationBlock.ts](./storyContinuationBlock.ts)
- [variableBlock.ts](./variableBlock.ts)
- [videoBlock.ts](./videoBlock.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/characterEffectBlock.test.ts tests/unit/cgDisplayBlock.test.ts tests/unit/storyContinuationBlock.test.ts
```
