# Core 业务核心

| 文件 | 框架 / 技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`project.cpp`](./project.cpp) | C++20 | 实现项目及时间线的原子业务变更。 | 创建项目、节点增删改、逻辑/CG 配对范围、批量重排与人物特效。 |
| [`project_queries.cpp`](./project_queries.cpp) | C++20 | 提供无副作用的实体查找与 ID 查询。 | `find_scene`、`find_scene_node`、各节点专用查询函数。 |
| [`project_validation.cpp`](./project_validation.cpp) | C++20 | 对项目、资源引用和控制结构做聚合校验。 | `validate_project`、`validate_scene_logic_structure`、`validate_project_aggregate`。 |
| [`project_internal.hpp`](./project_internal.hpp) | C++20 | 共享 Core 内部的轻量校验辅助。 | 空白裁剪、人物位置与特效参数校验。 |

