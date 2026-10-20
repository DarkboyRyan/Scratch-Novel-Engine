# Hello Project

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This minimal Author v1 example contains one entry scene and one narration line, with no media assets.

Open this directory in Editor. Expect project “示例项目：你好”, scene “开场”, and narration “这是从 project.vn.json 读取的第一句对白。”. Reader fills in an empty visual state, title defaults, and at least one empty CG gallery page in memory.

Keep [`project.vn.json`](./project.vn.json) at v1. Copy the directory before saving: Writer emits Author v22, while Project and Scene `schemaVersion` values remain 1. Migration supplies the `A VN ENGINE STORY` eyebrow, 100% story image scales, and default title/gallery styles. Add current-format examples in a separate directory.

Run the full migration tests from the repository root:

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R vn_engine_backend_tests --output-on-failure
```
