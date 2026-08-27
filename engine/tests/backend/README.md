# Backend 测试

| 文件 | 框架 / 技术 | 主要作用 | 关键覆盖 |
| --- | --- | --- | --- |
| [`backend_tests.cpp`](./backend_tests.cpp) | C++20、CTest、JSON | 验证 JSONL 命令与 Author 版本迁移。 | exact params、revision、v1–v19、人物模式、恶意输入和原子失败。 |
| [`asset_import_tests.cpp`](./asset_import_tests.cpp) | C++20、CTest | 验证三类媒体的安全导入。 | magic bytes、源变更、符号链接、并发发布与 no-clobber。 |
| [`atomic_file_tests.cpp`](./atomic_file_tests.cpp) | C++20、CTest | 验证耐久写入和失败恢复。 | 临时文件、替换故障、旧文件保留。 |
