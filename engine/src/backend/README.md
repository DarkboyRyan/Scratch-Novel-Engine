# JSONL Backend

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

Backend 是 Electron Main 与 Core 之间的进程边界，负责严格协议解析、Author 迁移、安全媒体导入和原子保存。

## 请求与存储

每行 stdin 输入交给 `Backend::handle`，校验请求 ID、方法、精确字段和会话后调用 Core。成功变更递增 `revision`，无变更操作保持版本；stdout 只输出单行 JSON 响应，日志写入 stderr。

撤销和重做恢复整个 Author 聚合。`documentRevision` 跟随历史状态识别保存点；历史上限为 100 条、64 MiB。Main 专用 `project.checkpoint` 写恢复快照，不改变保存点或历史。详见[撤销与恢复](../../../docs/editor-history-and-recovery.md)。

- `scene.content.replace` 接收无隐藏标记的嵌套草稿，限制为 2 MiB、10,000 个实体和 16 层控制结构；CG 内只允许对白。完整候选项目通过校验后才替换场景。
- `project.open` 接收 Main 稳定读取的内容快照。Reader 支持 Author v1–v22，迁移并校验后才替换会话；Writer 固定写 v22。v1–v20 图片缩放补 100%，v1–v21 页面样式补安全默认值。
- `asset.import` 在同一文件句柄上检查扩展名、文件头、大小和普通文件身份，再无覆盖发布。支持 PNG/JPEG/WebP、MP4/WebM、MP3/WAV/Ogg。
- `project.save` 使用同目录临时文件、flush 和原子替换保护旧文件。
- `asset.rename` 只改显示名；`asset.deleteMany` 要求非空、无重复的 ID 集合，全部未被引用才提交。两者不改变资源路径，Backend 不删除实体文件。

## 源码

- [`main.cpp`](./main.cpp)：JSONL 循环。
- [`backend.cpp`](./backend.cpp)：会话和方法分派。
- [`serialization.cpp`](./serialization.cpp)：严格读取、迁移和写出。
- [`asset_import.cpp`](./asset_import.cpp)、[`media_sniffer.cpp`](./media_sniffer.cpp)：媒体识别和安全发布。
- [`atomic_file.cpp`](./atomic_file.cpp)：耐久原子替换。

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R "vn_engine_(backend|atomic_file|asset_import)_tests" --output-on-failure
```

修改协议、格式或文件规则时，覆盖畸形输入、旧版迁移、失败回滚和跨平台路径。
