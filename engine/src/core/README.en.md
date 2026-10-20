# Core

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Core depends only on the C++20 standard library and public headers. It owns project IDs, references, ordering, and atomic edits.

Changes validate the complete candidate state before committing. Failed commands leave the project unchanged; assigning the same value succeeds without a change. Reordering and deletion must preserve paired If/Else, Repeat, and CG ranges. Character `show`, `clear`, and seven effect types have strict field constraints. Story image scales are integers from 10 to 300; empty backgrounds and cleared portraits require 100.

Asset renaming preserves IDs, types, paths, and references while checking UTF-8, length, and same-type name conflicts. Batch deletion checks every target and reference first; any referenced asset rejects the whole operation.

## Source

- [`project.cpp`](./project.cpp): project, asset, and node editing.
- [`project_queries.cpp`](./project_queries.cpp): queries without side effects.
- [`project_validation.cpp`](./project_validation.cpp): model and aggregate validation.
- [`project_internal.hpp`](./project_internal.hpp): text, position, hierarchy, scale, and effect checks.

```sh
cmake --build engine/build --target vn_engine_core_tests --parallel
ctest --test-dir engine/build -R vn_engine_core_tests --output-on-failure
```

Command tests should cover changed, unchanged, and expected failure results, and verify that failures preserve the aggregate.
