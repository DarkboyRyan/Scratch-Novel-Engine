# C++ 测试

[返回 C++ Engine](../README.md)

`engine/tests/` 使用自包含的 C++ 可执行文件和 CTest 保护领域规则与受信任边界。测试不依赖
Electron UI：Core 用确定性 ID 直接验证聚合，Backend 测试构造协议与文件场景，确保错误
输入不会产生部分变更或覆盖已有数据。

## 测试分层

| 子目录 | 技术 | 主要作用 |
| --- | --- | --- |
| [`core/`](./core/README.md) | C++20、CTest | 项目模型、节点命令、控制结构和失败原子性。 |
| [`backend/`](./backend/README.md) | C++20、CTest、JSON | JSONL、Author 迁移、媒体导入和原子文件边界。 |

CMake 注册四个目标：`vn_engine_core_tests`、`vn_engine_backend_tests`、
`vn_engine_atomic_file_tests` 和 `vn_engine_asset_import_tests`。

## 运行测试

```sh
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

定位单个目标时可使用 `ctest --test-dir engine/build -R <name> --output-on-failure`。修改
序列化版本或公共模型后应运行完整测试集，因为同一变化通常同时影响 Core 和 Backend。

