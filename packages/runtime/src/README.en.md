# Runtime Source

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Import public APIs through [`index.ts`](./index.ts).

| File | Responsibility |
| --- | --- |
| [`projectTypes.ts`](./projectTypes.ts) | Normalized project, node, and asset types. |
| [`gameRuntime.ts`](./gameRuntime.ts) | Progression, choices, logic, loops, CG, and character state. |
| [`gameRuntimeSnapshot.ts`](./gameRuntimeSnapshot.ts) | Snapshot v1–v5 validation, creation, comparison, and restoration. |
| [`logicValidation.ts`](./logicValidation.ts) | Logic AST, variables, and execution budgets. |
| [`characterEffect.ts`](./characterEffect.ts) | Seven character effect types and field constraints. |
| [`imageScale.ts`](./imageScale.ts) | Public scale limits and defaults. |

`advanceGame` processes automatic nodes. Hosts report choices, video completion, and completed CG lead-ins. Invalid control structures return stable errors. Snapshots retain variables, loop stacks, CG, image scales, character layers, and final opacity, but only sequence numbers for transient effects.

Story image scales are integers from 10 to 300; empty backgrounds and cleared characters use 100. Title screens and CG do not use this field. Compatible Runtime v1–v10 and Snapshot v1–v4 inputs receive 100% defaults.

Keep functions serializable and independent of time, disk, and DOM. Automatic nodes must respect step budgets; loop state belongs in snapshots. After changes, run `pnpm --dir packages/runtime test` and check Editor/Player types.
