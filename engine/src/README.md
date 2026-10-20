# C++ 实现

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

Core 实现领域规则，Backend 将 JSONL 请求、Author 文件和受信任路径转换为 Core 调用。依赖方向为 Backend → 公共模型 → Core；Core 不包含 Backend 头文件，也不链接 JSON 库。

- [Core](./core/README.md)：查询、原子编辑、控制范围和聚合校验。
- [Backend](./backend/README.md)：协议、Author v1–v22 迁移、媒体导入和原子保存。

一次外部请求必须保持原子提交，并准确更新会话 revision。领域校验统一放在 Core。

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```
