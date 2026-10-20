# Core

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

Core 只依赖 C++20 标准库和公共头文件，负责项目 ID、引用、顺序和原子编辑。

变更先验证完整候选状态，再提交。失败不改变项目，设置相同值成功返回且不产生变更。If/Else、Repeat 和 CG 的配对范围不能被重排或删除切断；人物 `show`、`clear` 和七类特效采用严格字段约束。剧情图片缩放为 10–300 的整数，空背景与清除立绘只能为 100。

资源改名保留 ID、类型、路径和引用，并校验 UTF-8、长度及同类型重名。批量删除先检查全部目标和引用，任一资源仍被使用便拒绝整批操作。

## 源码

- [`project.cpp`](./project.cpp)：项目、资源和节点编辑。
- [`project_queries.cpp`](./project_queries.cpp)：无副作用查询。
- [`project_validation.cpp`](./project_validation.cpp)：模型和聚合校验。
- [`project_internal.hpp`](./project_internal.hpp)：文本、位置、层级、缩放与特效检查。

```sh
cmake --build engine/build --target vn_engine_core_tests --parallel
ctest --test-dir engine/build -R vn_engine_core_tests --output-on-failure
```

命令测试需覆盖发生变更、无变更和预期失败，并验证失败前后聚合一致。
