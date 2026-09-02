# Core 业务核心

[返回 C++ 实现层](../README.md)

`src/core/` 实现 Scratch Novel Engine 的权威业务规则。它只依赖 C++20 标准库和公共头文件，不知道
JSONL、文件路径或 Electron。所有前端最终都通过这里的命令维护同一 Project Aggregate，
从而获得一致的 ID、引用、顺序和失败原子性。

## 核心工作流

查询函数返回模型中的实体；变更函数先解析所有目标和候选值，再验证资源类型、全局引用、
时间线锚点及控制块边界，最后一次性提交。失败命令不改变聚合，设置相同值是成功的 no-op。

逻辑 If/Else、Repeat 与 CG 使用成对标记，重排和删除不能切断范围。人物 `show` 占位、
显式 `clear` 和七类 sidecar 特效使用严格判别约束；剧情背景和人物缩放必须是 10–300
的整数，空背景或 clear 只能为 100。最终的 `validate_project_aggregate` 会再次检查场景、
资源、CG 九槽、选择目标及所有嵌套结构。

## 文件索引

| 文件 | 主要作用 | 关键实现 |
| --- | --- | --- |
| [`project.cpp`](./project.cpp) | 实现项目及时间线的原子业务变更。 | 节点增删改、控制范围、CG、逻辑、人物与批量重排 |
| [`project_queries.cpp`](./project_queries.cpp) | 提供无副作用的实体与节点查找。 | `find_scene`、`find_scene_node`、专用查询函数 |
| [`project_validation.cpp`](./project_validation.cpp) | 执行模型和 Project Aggregate 校验。 | `validate_project`、控制结构与资源引用 |
| [`project_internal.hpp`](./project_internal.hpp) | 共享仅供 Core 使用的轻量辅助。 | 文本、位置、层级、缩放和特效参数检查 |

## 开发与验证

```sh
cmake --build engine/build --target vn_engine_core_tests --parallel
ctest --test-dir engine/build -R vn_engine_core_tests --output-on-failure
```

新增业务命令时应同时覆盖 changed、unchanged 和每个可预期失败分支，并验证失败前后聚合
完全相等。
