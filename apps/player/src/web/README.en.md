# Web Player

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Web Player is a static host deployed with an exported game. It reuses Renderer and the shared UI, using Fetch for same-origin content, IndexedDB for saves and settings, and the Fullscreen API.

Startup reads `web-export.json`, then loads the bundle under `game/<build-id>/`. The loader validates origins, redirects, sizes, UTF-8, versions, build IDs, and manifests. Asset URLs must stay within the same-origin game directory. Web builds run only the embedded game, cannot select local bundles or resize system windows, and reload the page on exit.

Saves are isolated by project ID, Runtime version, and content fingerprint. General settings are global; explicitly selected languages are scoped by project ID and bundle default language. Legacy global language values do not override new bundle defaults. Fullscreen or volume updates do not persist an implicit language preference.

Serve exports over HTTP(S); opening `file://` is unsupported. Preserve the relative paths between the descriptor, game directory, and template assets, and do not mix files from different exports.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/webBundleLoader.test.ts \
  tests/unit/webPlayerGateway.test.ts \
  tests/unit/webStorage.test.ts
pnpm --dir apps/player prepare:web-template
```

## Source files

- [`WebBundleLoader.ts`](./WebBundleLoader.ts)
- [`WebPlayerGateway.ts`](./WebPlayerGateway.ts)
- [`WebStorage.ts`](./WebStorage.ts)
- [`index.html`](./index.html)
- [`index.tsx`](./index.tsx)
