# C++ Engine

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`engine/` contains the C++20 domain core and JSON Lines backend. Core owns the authoritative project, entity IDs, reference validation, and atomic edits. Backend handles the protocol, files, and media imports.

## Formats and boundaries

- Author: reads v1–v22, replacing the current project only after migration and validation; always writes v22.
- Runtime: Editor Main exports v13 and supplies the Editor's default language. Story execution belongs to the shared Runtime.
- Snapshot: Player saves progress as v5, separately from Author files.

Backend depends on Core. Core has no JSON, Electron, or filesystem dependency. Read models through `vnengine/model.hpp`; edit and validate through `vnengine/project.hpp`. Renderer receives project data without storage paths.

## Build and verify

Run from the repository root. Initial configuration fetches `nlohmann/json` v3.11.3.

```sh
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

The development backend is `engine/build/vn_engine_backend`. To stage a release build:

```sh
pnpm --dir apps/editor engine:stage:release
```

## Directories

- [Public headers](./include/README.en.md): domain models and editing APIs.
- [Implementation](./src/README.en.md): Core rules and Backend protocol, migration, and storage.
- [Tests](./tests/README.en.md): domain, protocol, media import, and atomic write regressions.

When changing Author fields, update the model, Core validation, Backend migration, protocol tests, and Editor exporter together.
