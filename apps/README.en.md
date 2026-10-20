# Applications

[中文](./README.md) | **English**

`apps/` contains the editor for creators and the players for readers. They share the story runtime and UI components, while maintaining separate Electron main processes, IPC interfaces, and release workflows.

| Application | Purpose |
| --- | --- |
| [Editor](./editor/README.en.md) | Write stories, manage assets, preview, and export games |
| [Player](./player/README.en.md) | Run exported games with saves, a CG gallery, and playback settings |

## Workflow

1. The editor creates or opens a visual novel project. The C++ backend validates it and maintains its state.
2. Forms, Blockly, and code editing submit changes through restricted IPC. Full previews use the shared runtime.
3. The exporter compiles the project into a runtime bundle, validates assets, and records page styles and the default interface language.
4. Desktop or Web players load the bundle, run the story, and store player settings and saves.

## Development and validation

Run the commands for the application you are working on from the repository root:

```sh
pnpm --dir apps/editor start
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
pnpm --dir apps/editor test

pnpm --dir apps/player start
pnpm --dir apps/player typecheck
pnpm --dir apps/player lint
pnpm --dir apps/player test
```

For story or display changes shared across applications, also check the [Runtime](../packages/runtime/README.en.md) and [shared UI](../packages/player-ui/README.en.md). See [technical documentation](../docs/README.en.md) for architecture and data formats.

[Back to the project](../README.en.md)
