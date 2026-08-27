# VN Engine C++ Core

[返回项目首页](../README.md)

`engine/` 是编辑器的 C++20 业务核心与 JSON Lines Backend。React 负责交互和局部界面状态，
C++ 负责权威 Author Project、实体 ID、跨实体约束和原子变更。文件路径、JSON 解析和媒体
导入留在 Backend 边界，`vn_engine_core` 本身不依赖 JSON 或 Electron。

## 架构位置

```text
Editor Renderer → Preload → Electron Main → vn_engine_backend → vn_engine_core
                                      │              │
                                 trusted paths   JSONL / Author I/O
```

依赖只从 Backend 指向 Core。只读取领域模型的代码包含 `vnengine/model.hpp`；需要创建、
查询、校验或修改项目时包含 `vnengine/project.hpp`。Renderer 只收到去除存储路径的投影，
不能直接构造权威 ID 或传入任意文件路径。

## 当前格式边界

| 契约 | 当前行为 |
| --- | --- |
| Author Writer | 固定写出 `fileVersion: 20`。 |
| Author Reader | 严格读取 v1–v20，先迁移与聚合校验，成功后才替换内存项目。 |
| Runtime Export | Editor 将 Author v20 编译为 Runtime v10；不在 C++ Core 中执行剧情。 |
| Save Snapshot | Player 使用 Snapshot v4；它不属于 Author 文件，也不由 Backend 持久化。 |

Author v20 为 `StartScreen` 新增可编辑 `eyebrow`：默认 `A VN ENGINE STORY`，空字符串
表示隐藏，保存值必须没有首尾 ASCII 空白、不含 NUL 且最多为 256 个 UTF-8 字节。
Author v19 的人物节点用 `mode: "show" | "clear"` 区分待选图和清除命令：
`show + assetId:null` 可以作为编辑占位，但导出必须拒绝；`clear` 要求资源、精确位置和
特效都为空。CG 画廊至少一页、每页恰好九个可空且不重复的图片槽。剧情内 CG 由严格配对
的起止节点表示，内部只能放对白，lead-in 为 0–60 秒。变量、If/Else 与 Repeat 使用受限
逻辑 AST 和配对标记，不保存或执行任意脚本。

## 请求工作流

1. Electron Main 启动 `vn_engine_backend`，每行发送一个带 `id`、`method` 和 `params`
   的 JSON 请求。
2. Backend 对方法和字段做 exact-field 校验，把命令映射到 Core，并在临时候选状态上完成
   所有业务检查。
3. 只有完整命令成功才提交项目并推进 `revision`；合法 no-op 不推进版本，失败不留下半成品。
4. Backend 每行输出一个 JSON 响应，日志只写 stderr。保存与资源导入使用 Main 提供的
   受信任绝对路径，并通过临时文件和无覆盖发布保护已有数据。

最小协议示例：

```json
{"id":1,"method":"project.create","params":{}}
{"id":1,"ok":true,"result":{"project":{"schemaVersion":1},"assets":[],"session":{"revision":0,"savedRevision":null,"isDirty":true}}}
```

命令按职责分为项目/场景、标题与 CG 画廊、媒体导入、时间线节点、选择子项、逻辑控制和
批量重排。新增实体的响应会返回由 C++ 生成的稳定 ID；`project.open` 只接收 Main 已稳定
读取的内容快照，`project.save` 只允许写入名为 `project.vn.json` 的规范化目标。

## 目录索引

| 目录 / 文件 | 技术 | 主要职责 |
| --- | --- | --- |
| [`include/`](./include/README.md) | C++20 公共 API | 权威模型、查询、校验与原子命令声明。 |
| [`src/`](./src/README.md) | C++20 | Core 与 JSONL Backend 的实现入口。 |
| [`src/core/`](./src/core/README.md) | C++20 | 无 JSON 依赖的领域规则和聚合校验。 |
| [`src/backend/`](./src/backend/README.md) | C++20、nlohmann/json、JSONL | 协议适配、Author 迁移、媒体探测和安全文件操作。 |
| [`tests/`](./tests/README.md) | CTest | Core、协议、序列化、资源导入和原子写入回归。 |
| [`CMakeLists.txt`](./CMakeLists.txt) | CMake 3.20+ | 构建 Core、Backend、安装目标和四组测试。 |

## 构建与验证

首次配置会获取固定版本的 `nlohmann/json` v3.11.3。

```sh
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

开发 Backend 位于 `engine/build/vn_engine_backend`。发布构建可由 Editor 脚本完成：

```sh
pnpm --dir apps/editor engine:stage:release
```

修改 Author 字段或节点时，必须同步更新公共模型、Core 命令与聚合校验、Backend
序列化/迁移、协议测试和 Editor 导出器。不要把 JSON 类型或文件系统操作引入 Core。
