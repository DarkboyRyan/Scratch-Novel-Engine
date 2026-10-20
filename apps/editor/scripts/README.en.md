# Editor release scripts

[中文](./README.md) | [English](./README.en.md)

`release.mjs` validates `editor-v<version>-mac/windows` tags and selects native runners. After packaging, it verifies bundled Backend and Web templates and collects platform-named installers, checksums, provenance and release notes.

`editor-release.yml` invokes `--mode metadata` or `--mode collect`. The release guide is linked below.

## Navigation

- [Editor release guide (Chinese)](../../../docs/editor-release.md)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor test:release-tools
```
