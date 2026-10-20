# C++ Tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Tests call C++ APIs directly without Electron. Core tests cover domain rules and atomic failures; Backend tests cover the protocol, migration, and file boundaries.

- [Core tests](./core/README.en.md): projects, nodes, control structures, and references.
- [Backend tests](./backend/README.en.md): JSONL, Author migration, asset import, and atomic replacement.

CMake registers `vn_engine_core_tests`, `vn_engine_backend_tests`, `vn_engine_atomic_file_tests`, and `vn_engine_asset_import_tests`.

```sh
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

Filter targets with `ctest --test-dir engine/build -R <name> --output-on-failure`. Run the full suite after public model or format version changes.
