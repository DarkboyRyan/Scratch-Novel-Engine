# Player Renderer

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Desktop and web builds share this React interface. Components use `PlayerGateway` rather than accessing Electron, files, or IndexedDB directly.

`App` coordinates loading, the title screen, Runtime lifecycle, settings, and saves. It chooses a stored player language or the bundle default based on the settings source and ignores stale loading results. Resetting settings also uses the current bundle language. Language selection affects the interface, while authored text stays unchanged.

`GameScreen` displays the story, choices, gallery, and video, and coordinates pause and fast-forward behavior. Shared `VisualStage` handles background and character scale. Media URLs resolve asynchronously by asset ID, with stale results ignored. The top level handles localized errors and modal focus.

Extend Gateway first for cross-host features, and keep reusable components in `packages/player-ui`. Advance Runtime through new states and save through its snapshot API rather than serializing component state.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerRenderer.test.tsx
pnpm --dir apps/player lint
pnpm --dir apps/player typecheck
```

## Directories

- [`player-ui`](../../../../packages/player-ui/README.en.md)
- [`styles`](./styles/README.en.md)

## Source files

- [`App.tsx`](./App.tsx)
- [`GameScreen.tsx`](./GameScreen.tsx)
- [`index.tsx`](./index.tsx)
- [`playerGateway.ts`](./playerGateway.ts)
- [`useResolvedMediaUrls.ts`](./useResolvedMediaUrls.ts)
