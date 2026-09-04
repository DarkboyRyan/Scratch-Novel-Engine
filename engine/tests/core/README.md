# Core 测试

[返回 C++ 测试](../README.md)

Core 测试直接调用公共 C++ API，使用确定性 ID 验证权威项目状态。它们覆盖成功变更、
revision-independent no-op 语义和所有预期失败分支，重点保证错误命令不会留下半个节点、
断裂的控制范围或无效资源引用。

## 文件索引

| 文件 | 主要覆盖 | 关键场景 |
| --- | --- | --- |
| [`project_tests.cpp`](./project_tests.cpp) | 项目、资源、场景、时间线及 Project Aggregate。 | 资源改名/引用保护删除、逻辑/CG 配对、九槽画廊、人物 show/clear 与特效、批量重排、失败原子性 |

## 运行测试

```sh
cmake --build engine/build --target vn_engine_core_tests --parallel
ctest --test-dir engine/build -R vn_engine_core_tests --output-on-failure
```

新增命令测试时，应同时断言返回状态、最终聚合和 ID/顺序稳定性；仅检查布尔成功不足以保护
原子编辑合同。
