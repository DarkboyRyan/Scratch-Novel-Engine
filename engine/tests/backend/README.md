# Backend 测试

[返回 C++ 测试](../README.md)

本目录验证 C++ 受信任边界，而不仅是正常协议响应。测试覆盖 Author 历史版本、exact-field
拒绝、session revision、媒体内容识别、符号链接与重解析点、并发发布、原子替换和失败后
旧数据保留。

## 文件索引

| 文件 | 主要覆盖 | 关键场景 |
| --- | --- | --- |
| [`backend_tests.cpp`](./backend_tests.cpp) | JSONL Handler、项目命令和 Author 序列化。 | v1–v20 迁移、v20 写出、标题上方文字、逻辑/CG/人物约束、恶意参数、revision |
| [`asset_import_tests.cpp`](./asset_import_tests.cpp) | 图片、音频和视频安全导入。 | magic bytes、源变更、链接、防覆盖和并发发布 |
| [`atomic_file_tests.cpp`](./atomic_file_tests.cpp) | 耐久文件替换与故障恢复。 | 临时文件、替换失败、旧文件保留 |

## 运行测试

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R "vn_engine_(backend|atomic_file|asset_import)_tests" --output-on-failure
```

涉及平台文件 API 的用例应在受支持的 macOS、Windows 和 Linux CI 上共同验证；本地通过
不能替代跨平台安全检查。
