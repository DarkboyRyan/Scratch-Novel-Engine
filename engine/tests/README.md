# C++ 测试

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

测试直接调用 C++ API，不依赖 Electron。Core 验证领域规则与失败原子性，Backend 验证协议、迁移和文件边界。

- [Core 测试](./core/README.md)：项目、节点、控制结构和引用约束。
- [Backend 测试](./backend/README.md)：JSONL、Author 迁移、资源导入和原子替换。

CMake 注册 `vn_engine_core_tests`、`vn_engine_backend_tests`、`vn_engine_atomic_file_tests` 和 `vn_engine_asset_import_tests`。

```sh
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

使用 `ctest --test-dir engine/build -R <name> --output-on-failure` 筛选目标。公共模型或格式版本变更后运行完整测试集。
