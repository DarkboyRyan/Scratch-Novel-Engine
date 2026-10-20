# Core Tests

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

[`project_tests.cpp`](./project_tests.cpp) uses deterministic IDs to test projects, assets, scenes, and timelines, including logic/CG pairing, nine-slot galleries, character show/clear and effects, batch reordering, and reference protection.

Cover changed, unchanged, and expected failure results for each command. Assert the result, final aggregate, and ID and order stability. Failures must leave the aggregate unchanged.

```sh
cmake --build engine/build --target vn_engine_core_tests --parallel
ctest --test-dir engine/build -R vn_engine_core_tests --output-on-failure
```
