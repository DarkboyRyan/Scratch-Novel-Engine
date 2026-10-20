# Player Fixtures

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`game/` is the minimal Runtime bundle used for desktop development, build validation, and release-tool tests. It provides stable input rather than a demo project or a place to save manual test progress.

The loader strictly checks `game.json`, `manifest.json`, versions, and assets. Only files allowed by the manifest belong inside the bundle; keep documentation, screenshots, and temporary files outside it. Update manifest metadata when adding resources and run the Player tests.

## Run and verify

```bash
pnpm --dir apps/player test
```

## Source files

- [Browse files](./game/)
- [`game/game.json`](./game/game.json)
- [`game/manifest.json`](./game/manifest.json)
