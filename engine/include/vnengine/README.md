# VN Engine 公共 API

[返回公共头文件](../README.md)

本目录定义 VN Engine 的权威领域接口。`model.hpp` 描述项目是什么，`project.hpp` 描述
项目可以如何被查询和原子修改。实现方可以替换前端或协议层，但必须继续遵守这里的聚合
约束。

## 使用方式

只读代码包含 `vnengine/model.hpp` 并通过判别联合访问时间线节点。变更代码包含
`vnengine/project.hpp`，由 `IdGenerator` 产生稳定 ID，再调用对应命令。命令会先验证
场景、资源类型、锚点和控制范围；预期失败通过结果枚举返回，不应由调用方先改对象再补救。

逻辑、CG 与人物节点是闭合的数据结构：控制块以配对标记落在扁平时间线中；人物
`show` 占位与 `clear` 命令具有不同约束；CG 画廊和媒体引用在整个 Project Aggregate
范围内校验。

## 文件索引

| 文件 | 主要作用 | 关键类型 / API |
| --- | --- | --- |
| [`model.hpp`](./model.hpp) | 定义项目、场景、资源、CG 及全部时间线节点。 | `ProjectAggregate`、`SceneNode`、`CharacterNodeMode`、`CharacterEffect` |
| [`project.hpp`](./project.hpp) | 声明创建、查询、校验和原子编辑命令。 | `IdGenerator`、`create_empty_project_aggregate`、节点命令、聚合校验 |

## 扩展新节点

新增节点通常需要同步完成模型判别项、查询函数、增删改结果类型、控制边界检查和聚合校验，
再在 Backend 增加 JSON 映射与版本迁移。完成后运行完整 CTest，而不是只验证能编译。
