# VN Engine 公共 API

| 文件 | 框架 / 技术 | 主要作用 | 关键类型、函数与实现 |
| --- | --- | --- | --- |
| [`model.hpp`](./model.hpp) | C++20、`std::variant` | 定义项目、场景、资源及全部时间线节点。 | `Project`、`SceneNode`、`CharacterNodeMode`、`CharacterEffect`、逻辑与 CG 节点。 |
| [`project.hpp`](./project.hpp) | C++20 | 声明项目查询、校验与原子变更 API。 | `IdGenerator`、`create_empty_project`、节点增删改、控制结构与校验函数。 |
