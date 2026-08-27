# JSONL Backend

| 文件 | 框架 / 技术 | 主要作用 | 关键函数、类与实现 |
| --- | --- | --- | --- |
| [`main.cpp`](./main.cpp) | C++20、stdin/stdout | 启动逐行读取请求的 Backend 进程。 | `main` 请求循环。 |
| [`backend.hpp`](./backend.hpp) | C++20 | 声明内存会话和协议处理器。 | `Backend`。 |
| [`backend.cpp`](./backend.cpp) | C++20、nlohmann/json | 精确校验 JSONL 方法并调用 Core 原子命令。 | `Backend::handle`、参数解析、revision/session 管理。 |
| [`serialization.hpp`](./serialization.hpp) | C++20、nlohmann/json | 声明 Author 文件读写及迁移接口。 | `project_file_from_json`、`project_file_to_json`。 |
| [`serialization.cpp`](./serialization.cpp) | C++20、nlohmann/json | 实现 v1–v19 严格读取、迁移和 v19 写出。 | 节点序列化、版本门禁、人物模式迁移、精确字段校验。 |
| [`asset_import.hpp`](./asset_import.hpp) | C++20、filesystem | 声明图片、音频和视频的安全导入计划。 | `AssetImportPlan`、`plan_asset_import`、`copy_asset_no_clobber`。 |
| [`asset_import.cpp`](./asset_import.cpp) | C++20、平台文件 API | 校验源文件并无覆盖发布到项目资源目录。 | 路径隔离、源快照、跨平台 no-follow/no-clobber。 |
| [`atomic_file.hpp`](./atomic_file.hpp) | C++20 | 声明耐久的原子文件替换。 | `atomic_write_file`。 |
| [`atomic_file.cpp`](./atomic_file.cpp) | C++20、POSIX/Win32 | 实现临时文件、fsync 与原子替换。 | 同目录临时文件、父目录刷新、失败回滚。 |
| [`media_sniffer.hpp`](./media_sniffer.hpp) | C++20 | 声明媒体 magic-byte 探测。 | `MediaKind`、`media_magic_matches`、MP3 probe。 |
| [`media_sniffer.cpp`](./media_sniffer.cpp) | C++20 | 验证 PNG/JPEG/WebP、MP4/WebM、MP3/WAV/Ogg 内容。 | 容器头解析、EBML、MPEG frame 与 Ogg codec 校验。 |
