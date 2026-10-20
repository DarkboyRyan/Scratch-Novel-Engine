# Backend 测试

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

- [`backend_tests.cpp`](./backend_tests.cpp)：JSONL、Author v1–v22 迁移、精确字段、revision 和资源/节点约束。
- [`asset_import_tests.cpp`](./asset_import_tests.cpp)：文件头识别、源文件变化、链接、防覆盖和并发发布。
- [`atomic_file_tests.cpp`](./atomic_file_tests.cpp)：临时文件、替换失败和旧数据保留。

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R "vn_engine_(backend|atomic_file|asset_import)_tests" --output-on-failure
```

平台文件 API 用例需在 macOS、Windows 和 Linux CI 上验证。
