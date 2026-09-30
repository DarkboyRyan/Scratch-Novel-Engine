# C++ 实现层

[返回 C++ Engine](../README.md)

`src/` 将领域实现和进程/存储边界分开。Core 只操作公共模型，Backend 把 JSONL 请求、
Author 文件和受信任路径转换为 Core 调用。这种拆分让业务规则可以被其他前端复用，也让
文件安全逻辑集中在一个边界内审计。

## 依赖方向

```text
src/backend → include/vnengine → src/core
```

Core 不包含 Backend 头文件，也不链接 `nlohmann/json`。Backend 可以组合多个 Core 命令，
但一次外部请求必须保持原子提交和准确的 session revision。

## 子目录索引

| 子目录 | 技术 | 主要作用 |
| --- | --- | --- |
| [`core/`](./core/README.md) | C++20 | 查询、原子编辑、控制范围和 Project Aggregate 校验。 |
| [`backend/`](./backend/README.md) | C++20、nlohmann/json、JSONL | 协议、Author v1–v22 迁移、媒体导入和原子文件发布。 |

## 开发与验证

修改 Core 时先运行 Core 测试；修改协议、序列化或文件操作时还要运行全部 Backend 测试。

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

不要在 Core 中引入路径、JSON 或进程状态，也不要在 Backend 中复制已经存在的领域校验。
