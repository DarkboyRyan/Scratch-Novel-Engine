# VN Engine：当前架构

> 面试版的技术选型、端到端调用链和常见问答见
> [技术栈与面试讲解指南](./technical-stack-interview-guide.md)。本文侧重当前代码的
> 分层和依赖方向。

## 1. 当前目标与完成能力

编辑器使用 Electron + React 构建桌面界面，Blockly 提供图形化编辑；项目数据、
业务规则、文件格式和媒体导入由 C++20 负责。这里的“后端”不是远程服务器，
而是 Electron Main 为每个编辑器窗口启动的本地 C++ 子进程。

当前已经实现：

- 场景、对白、背景切换、人物立绘、视频播放、选项分支和显式场景跳转；
- 表单编辑与 Blockly 图形化编辑共享一条剧情时间线；
- 项目文件夹新建、保存、打开、dirty 状态和 Cmd/Ctrl+S；
- 未保存项目导入图片/视频/音频，以及 capability 媒体读取；
- 对白语音、时间线 BGM，以及正式预览中的双音轨播放；
- 正式游戏顺序预览、阻塞式视频/选项、点击推进和跳转循环保护；
- C++ Core/Backend、IPC、存储、Blockly 和预览的自动测试。

## 2. 技术栈

| 层 | 当前技术 | 主要用途 |
| --- | --- | --- |
| Renderer | React 19、TypeScript 5.9、HTML/CSS | UI、表单草稿、资源条和预览 |
| 图形编辑 | Blockly 13.1 | 剧情积木、拖动、框选、删除和顺序编辑 |
| 桌面边界 | Electron 43、contextBridge、IPC | 窗口、原生菜单/对话框和权限隔离 |
| 本地核心 | C++20、STL、CMake | 领域模型、校验、revision 和持久化 |
| JSON 边界 | nlohmann/json 3.11.3、JSONL | C++ 项目文件与 Main↔C++ 协议 |
| 文件安全 | Node 文件 API、C++ OS 文件 API | 临时工作区、流式复制、fsync、原子替换 |
| 构建打包 | Vite 5、Electron Forge 7、pnpm | 三个 Electron target 和生产安装包 |
| 测试 | Vitest、CTest、真实 C++ JSONL 集成 | TS、C++、协议和文件事务回归 |

## 3. 进程和调用关系

```text
React / Blockly Renderer
  ↓ window.vnEngine / window.vnAssets / window.vnProjectFiles
Preload contextBridge
  ↓ Electron IPC（ipcRenderer.invoke）
Electron Main
  ↓ BackendClient：stdin/stdout JSON Lines
vn_engine_backend
  ↓
C++ Project Core
```

项目不启动用于业务 API 的 HTTP Server，也不监听业务端口。Electron IPC 负责
低权限 Renderer 到高权限 Main；JSONL 负责 Main 到独立 C++ 子进程。开发模式
仍由 Vite dev server 通过本地 HTTP/WebSocket 提供 Renderer 页面和 HMR，
它不是项目数据或 C++ 业务通信通道。

每个 BrowserWindow 拥有独立的：

- `BackendClient` 和 C++ 子进程；
- `ProjectFileSession`；
- `ProjectStorageSession` 临时工作区；
- `FileOperationCoordinator`；
- Electron session 和 `vn-asset://` protocol handler。

因此新建项目窗口不会和旧窗口共享内存 Project 或资源能力 URL。

## 4. 每一层负责什么

### 4.1 React Renderer

React 负责当前窗口的交互状态：

- 当前场景、节点和编辑模式；
- 输入框、Blockly 活动字段和项目名称草稿；
- 资源列表与 capability 预览 URL；
- 游戏预览临时会话；
- busy、dirty 和错误提示。

React 不生成持久化实体 ID，也不直接修改 `project.scenes` 或 `scene.nodes`。
`useEngineProject` 发送命令并在成功后应用 C++ 返回的完整快照。

### 4.2 Preload

Preload 使用 `contextBridge` 暴露三个窄接口：

```ts
window.vnEngine       // 领域命令
window.vnProjectFiles // 新建、打开、保存和会话状态
window.vnAssets       // 导入图片/视频/音频和申请 capability URL
```

Renderer 看不到 `ipcRenderer`、Node 文件系统、child process 或本机资源路径。

### 4.3 Electron Main

Main 负责：

- 窗口、原生菜单和文件选择器；
- 校验 IPC 来源和参数形状；
- 为每个窗口启动/关闭 C++ 后端；
- 管理请求 ID、Promise、进程退出和错误；
- 管理项目目录、临时工作区和原子发布；
- 把 C++ 私有 Asset 净化成公开 DTO；
- 提供带能力令牌的安全图片/音频/视频 protocol，以及音频和视频 Range 响应。

Main 不决定“场景是否能删除”或“人物层是否合法”，最终领域规则仍由 C++ 决定。

### 4.4 C++ Backend

Backend 使用 nlohmann/json 处理两种边界：

- JSONL 请求/响应；
- `project.vn.json` 文件 envelope。

它把 method/params 转成 Core 调用，维护 `revision/savedRevision/isDirty`，并返回
完整 Project、公开 Asset 元数据和会话状态。stdout 只写 JSONL，日志必须写 stderr。

### 4.5 C++ Core

Core 是唯一业务权威来源，且不依赖 Electron 或 JSON。它负责：

- `ProjectAggregate = Project + Assets`；
- `SceneNode` 七种判别类型；
- ID 生成、全局唯一性和引用完整性；
- 场景、对白语音、背景、人物、BGM、视频、选项和跳转操作；
- 混合时间线原子删除与重排；
- 入口场景和被跳转引用场景的保护规则；
- no-op 判断和候选对象提交。

未来的原生 Player、命令行导出器或 WASM 层可以复用 Core，而无需依赖编辑器 UI。

## 5. 权威数据模型

```cpp
using SceneNode = std::variant<
    Dialogue,
    BackgroundNode,
    CharacterNode,
    SceneJumpNode,
    BgmNode,
    VideoNode,
    ChoiceNode>;

struct ProjectAggregate {
  Project project;
  std::vector<Asset> assets;
};
```

七种节点共享 `Scene.nodes` 的唯一顺序：

- `Dialogue`：玩家可见的对白停顿点，可选绑定一次性人物语音；
- `BackgroundNode`：设置图片或显式切换为无背景；
- `CharacterNode`：设置/清除某人物层；
- `SceneJumpNode`：切换到稳定 Scene ID；
- `BgmNode`：循环播放或停止持续生效的背景音乐；
- `VideoNode`：阻塞播放视频，结束或按 Enter 跳过后返回下一条时间线节点；
- `ChoiceNode`：包含零个或多个稳定 ID 的选项；空节点跳过，非空节点等待玩家选择。

Asset 只描述媒体文件，不保存“它是背景还是立绘”。用途由时间线节点引用决定，
同一张图可以被不同场景以不同方式复用。

## 6. 为什么返回完整 Project 快照

每次修改成功后，C++ 返回结构化结果：

```json
{
  "project": {},
  "assets": [],
  "session": {
    "revision": 8,
    "savedRevision": 7,
    "isDirty": true
  },
  "nodeId": "可选的新节点 ID"
}
```

React 用新的 `project/assets/session` 替换旧快照。这样不会出现“React 已经改了
顺序，但 C++ 拒绝了操作”的双重状态。当前项目规模下完整快照更容易保证正确；
未来数据量变大时可以加入基于 revision 的 patch，但业务规则仍只能有一份。

## 7. 草稿与已提交数据

表单输入、Blockly FieldInput 和项目名在编辑期间是 Renderer 草稿。保存、导入、
切换模式、切换场景或开始预览前，必须先提交当前草稿。

对白提交时：

- 文本去掉首尾空白；
- 空文本被拒绝；
- 角色名去掉首尾空白；
- 空角色名规范化为“旁白”。

React 的检查提供即时提示，C++ 的检查才是最终规则。

## 8. Blockly 不是第二份 Project

Blockly 工作区由 C++ Scene 快照投影而来。用户新增、修改、拖动或删除积木时：

```text
Blockly event
  → 解析 typed timeline command
  → C++ 修改权威 Project
  → 返回新快照
  → 清理临时积木并重新投影正式节点
```

画布根位置、缩放和滚动属于视图布局，单独保存在 Renderer 的场景布局 Map 中；
它们不影响游戏执行顺序，也不进入 `project.vn.json`。

ChoiceNode 在顶层剧情连接中占一个位置，ChoiceOption 则通过专用 Blockly statement
connection 嵌套在容器内部。Option 不是独立 SceneNode；新增、修改、删除和内部
重排分别转换成 `choice.option.*` 命令，并按 C++ 生成的稳定 Option ID 重新投影。

## 9. 项目文件夹和媒体

```text
项目文件夹/
├── project.vn.json
└── assets/
    ├── images/
    ├── videos/
    └── audio/
```

Main 掌握项目根和源媒体路径，Renderer 只知道 `hasStorage`、文件夹显示名和
公开 Asset `{id,type,displayName}`。

保存采用“媒体先发布，manifest 最后原子替换”；未保存项目先使用窗口私有临时
工作区。图片预览以及音频/视频播放使用 `vn-asset://` capability URL，而不是
`file://`；音频和视频支持安全的单段 Range 响应。

当前 Writer 写 `fileVersion: 9`，Reader 支持 v1–v9；v9 新增严格序列化的
ChoiceNode/ChoiceOption，空 options 数组也是合法项目数据。

详见 [项目文件夹存储与媒体资源实现](./project-folder-storage.md)。

## 10. 游戏预览

当前正式预览是 TypeScript 纯状态机：从 `entrySceneId` 开始，自动执行背景、
人物、BGM 和场景跳转，遇到对白时暂停；遇到非空 VideoNode 时进入阻塞播放，
视频 ended 或按 Enter 跳过后才继续；遇到非空 ChoiceNode 时进入 `choosing`，
点击选项后跳到其目标场景。空 ChoiceNode 直接跳过。

场景跳转和选项跳转都会清空上一场景人物层并加载目标场景初始背景，同时保留
BGM。运行时使用
访问位置集合检测“没有对白可停留”的跳转循环。预览会话不写回 C++ Project、
revision 或磁盘。

详见 [游戏顺序预览](./game-preview-runtime.md)、
[视频播放积木](./video-playback-block.md) 与
[场景跳转实现](./scene-jump-implementation.md)，以及
[选项分支实现](./choice-branch-implementation.md)。

## 11. 目录结构

```text
engine/
├── include/vnengine/
│   ├── model.hpp
│   └── project.hpp
├── src/
│   ├── core/project.cpp
│   └── backend/
│       ├── backend.cpp/.hpp
│       ├── serialization.cpp/.hpp
│       ├── atomic_file.cpp/.hpp
│       ├── image_asset_import.cpp/.hpp
│       └── main.cpp
└── tests/

apps/editor/src/
├── main.ts
├── preload.ts
├── main/
│   ├── backend/
│   ├── ipc/
│   ├── project/
│   ├── assets/
│   └── window/
├── renderer/
│   ├── App.tsx
│   ├── hooks/useEngineProject.ts
│   ├── components/
│   └── features/
│       ├── form-editor/
│       ├── block-editor/
│       ├── assets/
│       └── game-preview/
└── shared/
    ├── projectTypes.ts
    ├── engineProtocol.ts
    ├── projectFileProtocol.ts
    ├── assetProtocol.ts
    └── global.d.ts
```

依赖方向固定为 `shared ← main / preload / renderer`。`shared` 不导入 React、
Electron 或 Node；Renderer 也不能导入 Main 实现。

## 12. 构建、测试和打包

```sh
fnm exec --using=24 pnpm --dir apps/editor start
fnm exec --using=24 pnpm --dir apps/editor typecheck
fnm exec --using=24 pnpm --dir apps/editor lint
fnm exec --using=24 pnpm --dir apps/editor test
fnm exec --using=24 pnpm --dir apps/editor package
```

`test` 会配置并构建 C++，运行 CTest，再执行 Vitest。生产打包先构建 Release
C++ Backend，通过 `cmake --install` 放入 `engine/stage/backend`，Forge 再用
`extraResource` 复制到应用的 `Resources/backend`。可执行文件不能放在
`app.asar` 内运行。

## 13. 当前边界

已完成的能力不等于完整游戏引擎。当前尚未完成：

- 变量、条件表达式、选项可见性和游戏存档；
- Undo/Redo；
- 同一项目根的多窗口排他锁；
- Blockly 布局持久化和未引用资源回收；
- 独立游戏 Player 与导出流水线。

这些是后续路线，面试时不应描述成已经采用或完成。
