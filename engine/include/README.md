# 公共头文件

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

`include/` 提供平台无关的 C++20 公共接口，实现位于 `engine/src/`。

进入 [vnengine](./vnengine/README.md) 查看领域 API：只读代码使用 `model.hpp`，创建、查询、校验和修改项目使用 `project.hpp`。

公共类型变更会影响 Core、Backend、Editor 协议和历史迁移。修改后运行完整 CTest：

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

JSON、协议和存储类型应留在 Backend。
