# Player UI

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`@vnengine/player-ui` provides shared React interfaces for Editor previews, Desktop Player, and Web Player.

Components use controlled props and callbacks. `VisualStage` renders backgrounds, characters, dialogue, and effects. `TitleScreen` and `CgGallery` map validated page styles. Action bars and dialogs return user intentions to the host. Components do not persist application state, settings, or saves.

Media is resolved through `MediaUrlResolver`. This package provides no global theme CSS; appearance comes from [Player styles](../../apps/player/src/renderer/styles/player.css) or scoped Editor styles. Shared components do not depend on Electron, Node.js, or host window capabilities.

## Usage and verification

```ts
import { PlayerUiProvider, VisualStage } from '@vnengine/player-ui';
```

Public APIs are exported through [`src/index.ts`](./src/index.ts). See the [source guide](./src/README.en.md). Update exports and documentation when adding components or hooks.

```sh
pnpm --dir packages/player-ui typecheck
pnpm --dir apps/player exec vitest run tests/unit/playerUiLocalization.test.tsx
```
