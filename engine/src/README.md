# C++ 实现层

| 子目录 | 框架 / 技术 | 主要作用 |
| --- | --- | --- |
| [`core/`](./core/README.md) | C++20 | 无 JSON 依赖的权威业务规则与聚合校验。 |
| [`backend/`](./backend/README.md) | C++20、nlohmann/json、JSONL | 将 Main 请求映射到 Core，并负责序列化和安全文件操作。 |

