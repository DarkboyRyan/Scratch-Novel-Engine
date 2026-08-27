# C++ 公共头文件

[返回 C++ Engine](../README.md)

`include/` 是 `vn_engine_core` 对外暴露的稳定 C++20 接口。这里定义可复用的领域数据与
命令声明，不包含 JSON、Electron 或文件系统细节；实现统一位于 `../src/`。

## 架构位置

Backend 通过这些头文件调用 Core，Core 测试也直接以同一 API 构造和修改项目。读取方只需
`model.hpp`；任何会生成 ID、验证聚合或改变项目的代码都应通过 `project.hpp`，避免绕过
原子业务规则。

## 目录索引

| 子目录 | 技术 | 主要作用 |
| --- | --- | --- |
| [`vnengine/`](./vnengine/README.md) | C++20、`std::variant` | Author 模型、查询、校验和编辑命令。 |

## 修改与验证

公共类型变更会影响 Core、Backend 序列化、Editor 协议和历史版本迁移。修改后至少执行：

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

头文件保持平台无关；与协议或存储有关的类型应留在 `src/backend/`。

