# Player Media

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This module serves images, audio, and video to Renderer through controlled `vn-game-asset://` URLs without exposing disk paths. URLs are bound to a bundle generation and random asset token.

Requests validate the scheme, media category, generation, token, and method, then check paths, file snapshots, size, MIME, and magic bytes through safe file APIs. Audio and video support a single byte range; images return complete content. Changing games, closing a window, or disposing the service stops active streams and invalidates old URLs.

New formats require changes to the shared media contract, magic-byte policy, loader, and tests. Extensions and browser MIME values alone are insufficient.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerMediaPolicy.test.ts \
  tests/unit/playerMediaService.test.ts
```

## Source files

- [`PlayerMediaService.ts`](./PlayerMediaService.ts)
- [`mediaPolicy.ts`](./mediaPolicy.ts)
- [`mediaRange.ts`](./mediaRange.ts)
