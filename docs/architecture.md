# VN Engine：当前架构

> 面试版的技术选型、端到端调用链和常见问答见
> [技术栈与面试讲解指南](./technical-stack-interview-guide.md)。本文侧重当前代码的
> 分层和依赖方向。
>
> 导出前的最新模块拆分和依赖约束见
> [代码结构整理与解耦](./code-organization-and-decoupling.md)。

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
- 平台无关的共享 Runtime/Player UI，以及只读独立 Electron Player MVP；
- Editor 的 v9→runtime v1 `.vngame` 目录包导出，以及 Player 原生目录选择换包；
- macOS Editor 基于严格 Player 模板的每游戏 `*-macOS.zip` 事务导出；ZIP 内含唯一
  已签名 `.app`，embedded Player 以固定内容启动；
- 通用 Player 正式发布和每游戏三平台构建的 GitHub Actions 门禁代码；
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
| 构建打包 | Vite 5、Electron Forge 7、pnpm、GitHub Actions | Electron targets、Player 模板、三平台制品和发布门禁 |
| 测试 | Vitest、Node Test、CTest、真实 C++ JSONL 集成 | TS、发布脚本、C++、协议和文件事务回归 |

## 3. 进程和调用关系

```text
React / Blockly Renderer
  ↓ window.vnEngine / window.vnAssets / window.vnProjectFiles / window.vnGameExport
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

Editor Preload 使用 `contextBridge` 暴露四个窄接口：

```ts
window.vnEngine       // 领域命令
window.vnProjectFiles // 新建、打开、保存和会话状态
window.vnAssets       // 导入图片/视频/音频和申请 capability URL
window.vnGameExport   // 无路径导出模式与安全应用 metadata
```

Renderer 看不到 `ipcRenderer`、Node 文件系统、child process 或本机资源路径。

### 4.3 Electron Main

Main 负责：

- 窗口、原生菜单和文件选择器；
- 校验 IPC 来源和参数形状；
- 为每个窗口启动/关闭 C++ 后端；
- 管理请求 ID、Promise、进程退出和错误；
- 管理项目目录、临时工作区和原子发布；
- 严格读取已保存 v9、编译 runtime v1，并以 staging/hash/rename 导出内容包；
- 校验当前平台/架构 Player 模板，在 macOS 私有工作区注入 runtime bundle、更新
  `Info.plist` 并 ad-hoc 签名；用 `ditto` 生成 ZIP、私有解压复验签名后，只发布
  一个不覆盖既有目标的 `*-macOS.zip`；
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

当前导出先复用 Core 已有的 v9 保存与 revision 边界，再由 Main 的 TypeScript 编译器
生成 runtime v1，没有新增 C++ export 命令。未来原生 Runtime、命令行工具或 WASM
仍可复用 Core，而无需依赖编辑器 UI。

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

### 10.1 Runtime Bundle、独立应用导出与 Player

Editor Renderer 点击“导出”后，先提交草稿、等待 Engine 队列并走既有 C++ 保存
链。只有 `hasStorage=true`、`isDirty=false` 且 `savedRevision===revision` 时，Main
才稳定读取已保存的 v9 清单，严格编译 runtime v1，只复制剧情引用媒体，并在目标
父目录使用排他锁、staging、SHA-256、fsync 和原子 rename 发布 `.vngame` 目录。
Renderer 不传入或接收本机路径。

导出弹层提供两种模式。内容包模式直接发布 `.vngame`；独立应用模式额外接受应用名、
严格 `x.y.z` 版本和 reverse-DNS Application ID。packaged macOS Editor 会读取
`Resources/player-templates/darwin-<arch>` 下的 exact manifest，先生成临时 bundle，
再安全复制 generic Player 模板并注入 `Contents/Resources/game`。Main 写入无路径
metadata、更新 `Info.plist`、执行 ad-hoc sign + deep/strict verify，再以 `ditto` 生成
`<安全应用名>-macOS.zip`。系统会把 ZIP 解压到另一处私有目录，确认根目录只有目标
`.app` 并再次 deep/strict 验签，最后才以单个普通文件、无覆盖方式发布 ZIP。目标
FileProvider 目录从不直接接触应用树。模板不匹配、已有目标、坏链接、ZIP 结构或签名
复验失败、revision 变化都会回滚；`.vngame` 仍是目录包，不随独立应用一起改成 ZIP。
为保持预构建 Electron Helper 查找有效，ZIP 内应用只自定义外层 `.app` 名、
`CFBundleDisplayName`、ID 和版本；内部 `CFBundleName`/`CFBundleExecutable` 仍为
`VN Engine Player`，不是整套内部二进制改名。

packaged Player 是不内嵌 fixture 的通用空壳。`openGame()` 只请求 Main 弹出原生
目录选择器；候选包全部验证成功后才 commit 并轮换 `vn-game-asset://` token。
取消或坏包会保留旧游戏。embedded Player 检测固定 `Resources/game`，严格加载后
禁用换包入口；坏 embedded 内容保持只读错误状态，不降级成通用选择器。开发模式仍
自动加载受控 fixture。

Windows/Linux 独立游戏和带正式图标的三平台产物不由 macOS Editor 后处理二进制，
而由 `player-game-build.yml` 在对应 runner 用 Forge 重新构建。`player-release.yml`
负责通用 Player 正式发布。两条 formal workflow 分别绑定 `game-release` 和
`player-release` protected Environment，均要求完整 Environment Secrets 且禁止
unsigned fallback；它们的实现已完成，但 protected Environment/Ruleset、真实凭据
GitHub runner 执行和干净机器测试尚无完整正式验收记录。
双击文件关联和干净机器测试也仍未完成。

本地 ZIP 中的 `.app` 仍是 ad-hoc 签名，只适合本机或内部测试，不代表 Developer ID
签名、公证或公开发行。ZIP 是传输产物，不是运行格式；例如发布到 Steam 时，通常先
解压并把应用目录作为 depot 内容上传，而不是让 Steam 直接运行 ZIP。

详见[独立游戏导出与 Player 技术路线](./game-export-player.md)。

## 11. 目录结构

```text
engine/
├── include/vnengine/
│   ├── model.hpp
│   └── project.hpp
├── src/
│   ├── core/
│   │   ├── project.cpp
│   │   ├── project_queries.cpp
│   │   └── project_validation.cpp
│   └── backend/
│       ├── backend.cpp/.hpp
│       ├── serialization.cpp/.hpp
│       ├── atomic_file.cpp/.hpp
│       ├── asset_import.cpp/.hpp
│       ├── media_sniffer.cpp/.hpp
│       └── main.cpp
└── tests/

packages/
├── runtime/                  # 无 React/DOM/Node/Electron 的纯剧情状态机
└── player-ui/                # 可注入媒体 Gateway 的 React 舞台与音视频控制

apps/editor/src/
├── main.ts
├── preload.ts
├── main/
│   ├── backend/
│   ├── ipc/
│   ├── project/             # Workflow、PathPolicy、Publisher、Session
│   ├── export/              # v9 编译、staging、manifest 与原子目录发布
│   ├── media/
│   ├── assets/
│   └── window/
├── renderer/
│   ├── App.tsx
│   ├── application/          # EditorMode、authoring ports 与平台 gateways
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
    ├── exportProtocol.ts
    └── global.d.ts

apps/player/
├── src/main/                 # bundle Reader/Session、只读 IPC 与媒体 capability
├── src/preload.ts            # loadGame/openGame/getMediaUrl
├── src/renderer/             # 标题、游戏、暂停、结束与错误页面
├── fixtures/game/            # 开发期受控 runtime v1 内容包
├── scripts/                  # 模板 staging、构建验证、签名与 release 工具
└── forge.config.ts           # 独立 Player 打包配置

.github/workflows/
├── player-ci.yml             # 三平台 internal 测试/制品与 Editor 模板检查
├── player-game-build.yml     # 可复用的每游戏正式候选构建
└── player-release.yml        # 通用 Player tag 正式发布门禁
```

关键依赖方向是 `runtime ← player-ui ← apps/editor / apps/player`。Editor 的
`shared` 继续承载 Electron IPC DTO，不能被独立 Player 当成模型包；Renderer 也不能
导入 Main 实现。完整约束见[代码结构整理与解耦](./code-organization-and-decoupling.md)。

## 12. 构建、测试和打包

```sh
fnm exec --using=24 pnpm --dir apps/editor start
fnm exec --using=24 pnpm --dir apps/editor typecheck
fnm exec --using=24 pnpm --dir apps/editor lint
fnm exec --using=24 pnpm --dir apps/editor test
fnm exec --using=24 pnpm --dir apps/editor package
fnm exec --using=24 pnpm --dir packages/runtime test
fnm exec --using=24 pnpm --dir apps/player test
fnm exec --using=24 pnpm --dir apps/player package
```

`test` 会配置并构建 C++，运行 CTest，再执行 Vitest。生产打包先构建 Release
C++ Backend，通过 `cmake --install` 放入 `engine/stage/backend`，Forge 再用
`extraResource` 复制到应用的 `Resources/backend`。macOS Editor 的 package/make
命令还会先构建 generic Player、事务式生成 `darwin-<arch>` 模板，再把
`engine/stage/player-templates` 复制为 `Resources/player-templates`。可执行文件和
大型游戏媒体都不能放在 `app.asar` 内运行。

## 13. 当前边界

已完成的能力不等于完整游戏引擎。当前尚未完成：

- 变量、条件表达式、选项可见性和游戏存档；
- Undo/Redo；
- 同一项目根的多窗口排他锁；
- Blockly 布局持久化和未引用资源回收；
- `.vngame` 双击/UTI 关联；
- Player 存档；
- GitHub `player-release`/`game-release` protected Environments、required reviewers、
  deployment ref rules、不可变 `player-v*` tag/Release 和 Environment Secrets 的外部
  配置验收；
- GitHub runner 上 Developer ID/公证、Authenticode 与 GPG release set 的首次正式
  执行，以及干净机器安装/卸载验证。

多平台 workflow、每游戏独立应用和 metadata/图标注入代码已经实现；没有真实证书
执行记录时，面试中只能称为“发布流水线实现完成”，不能称为“正式发行完成”。
完整上线清单见[独立游戏导出文档的 GitHub 外部配置](./game-export-player.md#91-上线前必须完成的-github-外部配置)。
