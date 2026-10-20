# Blockly story editor

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Blockly projects the author project into blocks; it is not an independent data source. `projectSceneToWorkspace.ts` creates stable IDs, fields and connections. `BlocklyWorkspace.tsx` routes events through `*BlockEvents.ts` into engine actions, then rebuilds the projection. Layout helpers separately preserve coordinates and viewport.

Background and portrait scale fields accept integers from 10–300%. Event handling collects unblurred drafts, and projection upgrades older HMR blocks missing fields. Scene headers configure the initial background and scale. Searchable media selectors store stable asset IDs.

Set-variable blocks retain free-text names. Change-variable and If/Else existing-variable operands use deduplicated names from all project Set nodes, allow prefix search and preserve orphaned legacy references.

All three Blockly surfaces share blank-canvas panning. A stationary long press in the story view starts box selection; block and group dragging remain separate. Story and CG category flyouts reserve viewport width through Blockly metrics without changing block coordinates or project data.

Distinguish programmatic projection events from user edits to avoid write-back loops. New blocks require definitions, toolbox entries, projection, event translation, localization and tests, including nested logic checks.

## Navigation

- [./blocks](./blocks/README.en.md)
- [BlockEditor.tsx](./BlockEditor.tsx)
- [blockEditorLayout.ts](./blockEditorLayout.ts)
- [blockGroupDrag.ts](./blockGroupDrag.ts)
- [blocklyWorkspaceMovement.ts](./blocklyWorkspaceMovement.ts)
- [dockedToolbox.ts](./dockedToolbox.ts)
- [BlocklyWorkspace.tsx](./BlocklyWorkspace.tsx)
- [blockSelection.ts](./blockSelection.ts)
- [backgroundBlockEvents.ts](./backgroundBlockEvents.ts)
- [cgDisplayBlockEvents.ts](./cgDisplayBlockEvents.ts)
- [characterBlockEvents.ts](./characterBlockEvents.ts)
- [characterEffectBlockEvents.ts](./characterEffectBlockEvents.ts)
- [choiceBlockEvents.ts](./choiceBlockEvents.ts)
- [dialogueBlockEvents.ts](./dialogueBlockEvents.ts)
- [dialogueGroupReorder.ts](./dialogueGroupReorder.ts)
- [EngineTrashcan.ts](./EngineTrashcan.ts)
- [logicBlockEvents.ts](./logicBlockEvents.ts)
- [logicStructure.ts](./logicStructure.ts)
- [projectSceneToWorkspace.ts](./projectSceneToWorkspace.ts)
- [sceneJumpBlockEvents.ts](./sceneJumpBlockEvents.ts)
- [singleDialogueBlockDragStrategy.ts](./singleDialogueBlockDragStrategy.ts)
- [storyBlockPagination.ts](./storyBlockPagination.ts)
- [storyBlockTypes.ts](./storyBlockTypes.ts)
- [storyContinuationBlockEvents.ts](./storyContinuationBlockEvents.ts)
- [toolbox.ts](./toolbox.ts)
- [zoomControlIcons.ts](./zoomControlIcons.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/logicBlocks.test.ts tests/unit/logicBlockEvents.test.ts tests/unit/blockEditorLayout.test.ts
```
