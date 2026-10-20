# Game export

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Export compiles the author project before building a Runtime Bundle, Web/WebGL ZIP or standalone application. Exporters copy stable assets and templates into staging, verify hashes and archives, and publish atomically. A file lock prevents concurrent publication to the same destination.

`compileAuthorProjectV15` strictly reads Author v14–v22; `RuntimeBundleExporter` first migrates v1–v13 through a canonical C++ snapshot. Compilation projects page styles, title eyebrow text, story-image scaling and Main-owned language while validating control flow, CG, effects and asset references.

Runtime v13 bundle manifests require `playerCompatibility: ">=13 <14"`; desktop and Web templates declare `runtimeCompatibility: ">=1 <14"`. Main supplies `game.defaultLanguage`, and Web ZIP root `index.html` must use the same `<html lang>`. Renderer cannot override it. Preserve strict page-style DTOs and story background/portrait scaling; title backgrounds and CG images do not gain that scaling field.

Keep export deterministic and reject path escapes or changes to previously verified inputs. Failure must preserve the previous output. Format changes also require Shared and Player Loader compatibility checks.

## Navigation

- [`AuthorProjectCompiler.ts`](./AuthorProjectCompiler.ts)
- [`ExportFileLock.ts`](./ExportFileLock.ts)
- [`ExportGameWorkflow.ts`](./ExportGameWorkflow.ts)
- [`RuntimeBundleExporter.ts`](./RuntimeBundleExporter.ts)
- [`StandaloneApplicationExporter.ts`](./StandaloneApplicationExporter.ts)
- [`StandalonePlayerTemplate.ts`](./StandalonePlayerTemplate.ts)
- [`WebPlayerExporter.ts`](./WebPlayerExporter.ts)
- [`WebPlayerTemplate.ts`](./WebPlayerTemplate.ts)
- [`../../shared/projectTypes.ts`](../../shared/projectTypes.ts)

## Commands

Run from the repository root:

```sh
pnpm --dir apps/editor exec vitest run tests/unit/authorProjectCompiler.test.ts tests/unit/runtimeBundleExporter.test.ts tests/unit/webPlayerExporter.test.ts
pnpm --dir apps/editor test:integration
```
