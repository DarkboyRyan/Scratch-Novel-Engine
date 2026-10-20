# C++ Implementation

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Core implements domain rules. Backend translates JSONL requests, Author files, and trusted paths into Core calls. Dependencies flow from Backend through the public model to Core; Core neither includes Backend headers nor links the JSON library.

- [Core](./core/README.en.md): queries, atomic edits, control ranges, and aggregate validation.
- [Backend](./backend/README.en.md): protocol, Author v1–v22 migration, media import, and atomic saves.

Each external request must commit atomically and update the session revision correctly. Keep domain validation in Core.

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```
