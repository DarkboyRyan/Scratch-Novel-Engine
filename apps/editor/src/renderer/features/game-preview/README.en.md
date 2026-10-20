# Game preview

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Editor preview uses Runtime and Player UI contracts for dialogue, choices, CG, audio/video, story-image scaling and portrait effects. It resolves media through Editor gateways and supports unsaved author projects.

`useGamePreview.ts` and `previewRuntime.ts` manage startup, scene entry, dialogue progression, CG lead-in waits and choices. `GamePreview.tsx` renders shared Player visuals; audio and video events feed the session.

Keep progression identical to exported Runtime. Timers, media callbacks and effects need pause, unmount cleanup and reduced-motion support so stale events cannot advance a new session.

## Navigation

- [GamePreview.tsx](./GamePreview.tsx)
- [previewAudioController.ts](./previewAudioController.ts)
- [previewRuntime.ts](./previewRuntime.ts)
- [PreviewVideo.tsx](./PreviewVideo.tsx)
- [useGamePreview.ts](./useGamePreview.ts)
- [usePreviewAudio.ts](./usePreviewAudio.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/previewRuntime.test.ts tests/unit/gamePreviewChoice.test.tsx tests/unit/gamePreviewCgDisplay.test.tsx tests/unit/gamePreviewCharacterEffects.test.tsx
```
