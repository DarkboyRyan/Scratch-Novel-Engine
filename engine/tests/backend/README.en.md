# Backend Tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

- [`backend_tests.cpp`](./backend_tests.cpp): JSONL, Author v1–v22 migration, exact fields, revisions, and asset/node constraints.
- [`asset_import_tests.cpp`](./asset_import_tests.cpp): magic bytes, source changes, links, overwrite prevention, and concurrent publication.
- [`atomic_file_tests.cpp`](./atomic_file_tests.cpp): temporary files, replacement failures, and preservation of existing data.

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R "vn_engine_(backend|atomic_file|asset_import)_tests" --output-on-failure
```

Validate platform file API cases in macOS, Windows, and Linux CI.
