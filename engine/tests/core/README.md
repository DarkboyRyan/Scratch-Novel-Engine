# Core 测试

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

[`project_tests.cpp`](./project_tests.cpp) 用确定性 ID 验证项目、资源、场景和时间线，包括逻辑/CG 配对、九槽画廊、人物显示/清除与特效、批量重排和引用保护。

每个命令应覆盖变更、无变更和预期失败；同时断言返回状态、最终聚合以及 ID 和顺序稳定性。失败必须保持聚合不变。

```sh
cmake --build engine/build --target vn_engine_core_tests --parallel
ctest --test-dir engine/build -R vn_engine_core_tests --output-on-failure
```
