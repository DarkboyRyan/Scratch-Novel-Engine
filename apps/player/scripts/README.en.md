# Player Scripts

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Build and release scripts handle embedded games, template staging, platform signing, and artifact validation. Desktop releases validate inputs and bundles before running Electron Forge, then check, sign, and collect the artifacts. Web releases build a separate static template and hash manifest.

Shared path, security, and platform rules belong in `lib`; top-level scripts coordinate steps and exit status. Normalize and constrain input paths rather than relying on broad globs or an implicit working directory. Supply keys through CI and restricted temporary files, never repository files or fixtures.

Release-tool tests do not require Electron. After changing web templates, also run `pnpm --dir apps/player prepare:web-template`. After changing desktop packaging, validate the actual Forge artifacts.

## Run and verify

```bash
pnpm --dir apps/player test:release-tools
```

## Directories

- [`lib`](./lib/README.en.md)
- [`tests`](./tests/README.en.md)

## Source files

- [`archiveWindowsBuild.mjs`](./archiveWindowsBuild.mjs)
- [`collectPlayerArtifacts.mjs`](./collectPlayerArtifacts.mjs)
- [`locatePlayerBuild.mjs`](./locatePlayerBuild.mjs)
- [`materializeSecretFile.mjs`](./materializeSecretFile.mjs)
- [`prepareEmbeddedArtifact.mjs`](./prepareEmbeddedArtifact.mjs)
- [`prepareEmbeddedFixture.mjs`](./prepareEmbeddedFixture.mjs)
- [`runEditorWithPlayerTemplate.mjs`](./runEditorWithPlayerTemplate.mjs)
- [`signPlayerBuild.mjs`](./signPlayerBuild.mjs)
- [`stagePlayerTemplate.mjs`](./stagePlayerTemplate.mjs)
- [`stageWebPlayerTemplate.mjs`](./stageWebPlayerTemplate.mjs)
- [`strictVerifyRuntimeBundle.ts`](./strictVerifyRuntimeBundle.ts)
- [`verifyGameBuildInputs.mjs`](./verifyGameBuildInputs.mjs)
- [`verifyPackagedEditorTemplate.mjs`](./verifyPackagedEditorTemplate.mjs)
- [`verifyPlayerBuild.mjs`](./verifyPlayerBuild.mjs)
- [`verifyReleasePrerequisites.mjs`](./verifyReleasePrerequisites.mjs)
- [`verifyReleaseSet.mjs`](./verifyReleaseSet.mjs)
