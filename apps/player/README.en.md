# Scratch Novel Engine Player

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Scratch Novel Engine Player provides an Electron desktop host and a Web Player for exported games, story playback, saved progress, and release templates. Desktop builds can open external `.vngame` directories or embed one game; web builds load a game from the same static site. Both share the React interface, Runtime, and component library.

On desktop, Main owns files, windows, saves, and media. Preload exposes an allowlisted API, and Renderer accesses it through `PlayerGateway`. The web host implements the same interface with Fetch, IndexedDB, and the Fullscreen API. It cannot select local game directories or resize operating-system windows.

Runtime v1–v13 are supported. Older bundles receive defaults for image scale, interface language, and title/gallery styles. Each host applies stored language preferences where applicable, otherwise using the bundle default. Language settings affect the player interface; authored text stays unchanged. Media uses controlled URLs, and saves contain versioned Runtime snapshots.

Run the commands below from the repository root. `start` uses the `fixtures/game` development fixture; `prepare:web-template` builds the web template used by Editor exports. `.vite/`, `dist/`, `out/`, and `node_modules/` are generated directories.

## Run and verify

```bash
pnpm --dir apps/player start
pnpm --dir apps/player test
pnpm --dir apps/player typecheck
pnpm --dir apps/player lint
pnpm --dir apps/player prepare:web-template
```

## Directories

- [`src`](./src/README.en.md)
- [`scripts`](./scripts/README.en.md)
- [`tests`](./tests/README.en.md)
- [`fixtures`](./fixtures/README.en.md)

## Source files

- [`fixtures/game`](./fixtures/game/)
- [`.eslintrc.json`](./.eslintrc.json)
- [`forge.config.ts`](./forge.config.ts)
- [`forge.env.d.ts`](./forge.env.d.ts)
- [`index.html`](./index.html)
- [`package.json`](./package.json)
- [`tsconfig.json`](./tsconfig.json)
- [`vite.main.config.ts`](./vite.main.config.ts)
- [`vite.preload.config.ts`](./vite.preload.config.ts)
- [`vite.renderer.config.ts`](./vite.renderer.config.ts)
- [`vite.web.config.ts`](./vite.web.config.ts)
