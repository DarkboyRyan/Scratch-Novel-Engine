# Player UI Source

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Export public components, hooks, and types through [`index.ts`](./index.ts).

- `PlayerUiProvider` supplies Chinese/English labels and localized errors.
- `TitleScreen`, `CgGallery`, `OptionsDialog`, `SaveSlotDialog`, and `GameActionBar` provide shared pages and interactions. An empty title eyebrow is hidden; page styles map only to fixed CSS variables and layout attributes.
- `VisualStage` renders resolved backgrounds, characters, dialogue, and effects. Scales range from 10% to 300%. Backgrounds scale around the center; portraits use a bottom-center anchor. Default character positions are `(20,100)`, `(50,100)`, and `(80,100)`; custom positions use the same anchor. A character without a portrait remains valid, and image failures affect only the relevant layer.
- `PreviewVideo`, `usePreviewAudio`, and `previewAudioController` manage media lifecycles. `mediaVolume` combines master and channel volume; `useAutoFitScale` fits content to its container.

## Interaction rules

Hosts own the safety and lifetime of URLs returned by `MediaUrlResolver`. Discard stale asynchronous results when assets or resolvers change to avoid media leaking between sessions. Handle autoplay rejection, completion, errors, and pauses.

Dialogs must manage initial focus, Tab trapping, Escape dismissal, and focus restoration. Add labels in both languages and provide a way to disable animation or respect reduced motion. Do not persist controlled props inside components.

```sh
pnpm --dir packages/player-ui typecheck
pnpm --dir apps/player exec vitest run \
  tests/unit/playerUiLocalization.test.tsx \
  tests/unit/playerMediaVolume.test.tsx \
  tests/unit/visualStageCharacterEffects.test.tsx
```
