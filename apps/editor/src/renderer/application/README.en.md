# Application services

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This layer adapts Renderer UI to Preload and Engine APIs. `authoringPorts.ts` defines shared authoring actions; `createAuthoringActions.ts` centralizes engine calls, errors and project refreshes. Form and Blockly therefore use the same editing semantics.

Gateways expose controlled media URLs, settings and project-file capabilities, including contract-version checks and restart errors. Missing Preload support must produce an explicit unavailable result. Do not return Electron objects or arbitrary host paths, or duplicate gateway/error logic in features.

## Navigation

- [authoringPorts.ts](./authoringPorts.ts)
- [createAuthoringActions.ts](./createAuthoringActions.ts)
- [editorMediaGateway.ts](./editorMediaGateway.ts)
- [editorMode.ts](./editorMode.ts)
- [editorSection.ts](./editorSection.ts)
- [editorPlatformGateway.ts](./editorPlatformGateway.ts)
- [editorSettingsGateway.ts](./editorSettingsGateway.ts)
- [mediaPort.ts](./mediaPort.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/createAuthoringActions.test.ts tests/unit/preloadEngineApi.test.ts tests/unit/preloadEditorSettings.test.ts
```
