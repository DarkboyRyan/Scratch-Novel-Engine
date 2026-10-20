# Public Headers

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`include/` provides platform-independent C++20 public interfaces. Implementations live in `engine/src/`.

See [vnengine](./vnengine/README.en.md) for the domain API. Use `model.hpp` for read-only access and `project.hpp` to create, query, validate, or edit projects.

Public type changes affect Core, Backend, the Editor protocol, and historical migrations. Run the full CTest suite after changes:

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

Keep JSON, protocol, and storage types in Backend.
