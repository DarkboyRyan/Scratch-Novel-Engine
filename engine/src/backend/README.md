# JSONL Backend

[返回 C++ 实现层](../README.md)

`src/backend/` 是 Electron Main 与 C++ Core 之间的受信任进程边界。它逐行处理 JSON
请求，严格解析字段并调用 Core；同时负责 Author v1–v22 读取、旧 v1–v21 迁移、v22 写出、安全媒体识别、
无覆盖资源导入和耐久原子保存。

## 请求与存储流程

1. `main.cpp` 从 stdin 读取一行，交给 `Backend::handle`。
2. Handler 校验请求 ID、方法、exact params 和当前会话，再调用 Core 命令。
3. 成功变更推进 revision；合法 no-op 保持 revision；异常被转换为稳定错误响应。
4. stdout 只输出单行 JSON 响应，诊断信息写 stderr，避免破坏协议流。

`scene.content.replace` 接收不含隐藏 marker 的嵌套剧情草稿。协议边界限制为 2 MiB、
10,000 个实体和 16 层控制结构，并在为数组分配内存前检查预算；CG body 在进入通用
递归解析前即限定为对白。Core 只在候选 Project 完整通过结构、引用、资源类型和全局
ID 校验后一次替换场景，因此错误 Code 不会留下部分提交。

`project.open` 使用 Main 已经稳定读取的内容快照。Reader 在临时对象上完成版本迁移和聚合
校验后才替换会话；Writer 始终写 Author v22。v21 精确保存场景初始背景、时间线背景和
人物立绘的 10–300 整数缩放；v1–v20 迁移为 100%，无背景或清除立绘也规范化为 100%。
v22 精确保存主界面和 CG 画廊样式，v1–v21 迁移为安全默认值。
`asset.import` 在同一文件句柄上验证扩展名、
magic bytes、大小和普通文件身份，再流式发布到类型目录；`project.save` 使用同目录临时
文件、flush 和原子替换保护旧文件。

## 文件索引

| 文件 | 主要作用 | 关键实现 |
| --- | --- | --- |
| [`main.cpp`](./main.cpp) | 启动 JSONL stdin/stdout 循环。 | 逐行请求与响应 |
| [`backend.hpp`](./backend.hpp) / [`backend.cpp`](./backend.cpp) | 管理项目会话并分派协议方法。 | `Backend::handle`、参数校验、revision |
| [`serialization.hpp`](./serialization.hpp) / [`serialization.cpp`](./serialization.cpp) | 严格读取、迁移和写出 Author 文件。 | v1–v22 Reader、v22 Writer、标题上方文字、图片缩放、页面样式与节点精确字段 |
| [`asset_import.hpp`](./asset_import.hpp) / [`asset_import.cpp`](./asset_import.cpp) | 规划并发布图片、音频和视频资源。 | 路径隔离、no-follow、no-clobber |
| [`media_sniffer.hpp`](./media_sniffer.hpp) / [`media_sniffer.cpp`](./media_sniffer.cpp) | 根据内容识别受支持媒体。 | PNG/JPEG/WebP、MP4/WebM、MP3/WAV/Ogg |
| [`atomic_file.hpp`](./atomic_file.hpp) / [`atomic_file.cpp`](./atomic_file.cpp) | 耐久地替换项目清单。 | 同目录临时文件、fsync、平台原子替换 |

## 开发与验证

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R "vn_engine_(backend|atomic_file|asset_import)_tests" --output-on-failure
```

协议字段、Author 版本和媒体规则属于安全边界。修改时必须补充畸形输入、旧版迁移、失败
回滚和跨平台路径用例，不能只覆盖成功路径。
