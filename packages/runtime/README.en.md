# Runtime

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`@vnengine/runtime` accepts plain TypeScript data and returns serializable story state. It has no Electron, DOM, timer, media playback, or storage dependency.

## Usage

1. `startGame(project)` creates state at the entry scene.
2. `advanceGame(project, state)` processes automatic nodes until dialogue, choices, video, a CG wait, completion, or an error.
3. Submit choices with `selectChoice`. Call `completeCgLeadIn` once the CG image is ready and its lead-in has elapsed.
4. Save Snapshot v5 with `createGameRuntimeSnapshot`; strictly validate before restoring through `restoreGameRuntimeSnapshot`. Restoration of v1–v4 is also supported within compatibility limits.

Upstream code normalizes external formats such as Runtime v13. The Player shell reads the default language; title and gallery styles use validated data.

If/Else, Repeat, and CG pairs are checked before execution. Logic supports only booleans, finite numbers, and bounded strings, with budgets for nesting, loops, steps, and variables. CG bodies allow dialogue only, with a maximum 60-second lead-in. Snapshots omit transient character effects but retain final opacity and event sequence numbers to prevent replay after loading. Story backgrounds and portraits use integer scales from 10% to 300%; empty backgrounds and cleared portraits use 100%. Older snapshots receive 100% defaults.

## Development

- [Source](./src/README.en.md): public types, state machine, and snapshots; import through `src/index.ts`.
- [Tests](./tests/README.en.md): runtime behavior, budgets, and snapshot compatibility.

```sh
pnpm --dir packages/runtime typecheck
pnpm --dir packages/runtime test
```

New nodes need matching types, state transitions, snapshot handling, and tests.
