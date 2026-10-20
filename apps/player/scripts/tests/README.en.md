# Player Script Tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

These `node:test` cases use temporary directories and small artifacts to check release-tool file operations without Electron or jsdom. `releaseTools.node-test.mjs` covers desktop templates, bundles, ASAR files, and release sets; `webPlayerTemplate.node-test.mjs` covers web payload allowlists, hashes, and staging-directory ownership.

New rules need both success and rejection cases, including tampering, repeated staging, rollback, and inconsistent platform metadata. Keep test data in temporary directories and do not use real local builds or signing material.

## Run and verify

```bash
pnpm --dir apps/player test:release-tools
```

## Source files

- [`releaseTools.node-test.mjs`](./releaseTools.node-test.mjs)
- [`webPlayerTemplate.node-test.mjs`](./webPlayerTemplate.node-test.mjs)
