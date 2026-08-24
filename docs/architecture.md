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
- 软件托管的主界面合成场景：表单与固定 Blockly 根积木共同编辑独立游戏标题、背景图片和背景音乐，
  新建、打开项目或启动 Editor 后默认进入该场景，并可预览完整标题页流程；
- 软件托管的 CG 画廊合成场景：表单可手动新增/删除页面并编辑固定九槽，独立 Blockly
  工作区由作者从工具箱加入“每页一个大模块、每模块九个图片下拉框”，并可预览完整主界面与画廊；
- 表单编辑与 Blockly 图形化编辑共享一条剧情时间线；长链只在 Blockly 中按编号“延伸”分页；
- 项目文件夹新建、保存、打开、dirty 状态和 Cmd/Ctrl+S；
- 未保存项目导入图片/视频/音频，以及 capability 媒体读取；
- 对白语音、时间线 BGM，以及正式预览中的双音轨播放；
- 正式游戏顺序预览、阻塞式视频/选项、点击推进和跳转循环保护；
- 平台无关的共享 Runtime/Player UI，以及只读独立 Electron Player MVP；
- Editor 的 v15→runtime v6 `.vngame` 目录包导出，以及 Player 原生目录选择换包；
- Player 兼容 runtime v1–v6；runtime v6 标题页渲染独立标题、自定义背景、循环标题音乐和固定的
  “开始游戏 / CG 画廊 / 选项 / 退出游戏”入口；CG 画廊保留每页九个固定槽位，支持分页、点击放大和 Esc 返回；
- macOS Editor 基于严格 Player 模板的每游戏 `*-macOS.zip` 事务导出；ZIP 内含唯一
  已签名 `.app`，embedded Player 以固定内容启动；
- 通用 Player 正式发布和每游戏三平台构建的 GitHub Actions 门禁代码；
- C++ Core/Backend、IPC、存储、Blockly 和预览的自动测试。

## 2. 技术栈

| 层 | 当前技术 | 主要用途 |
| --- | --- | --- |
| Renderer | React 19、TypeScript 5.9、HTML/CSS | UI、表单草稿、资源条和预览 |
| 图形编辑 | Blockly 13.1 | 剧情积木与编号延伸分页、主界面固定结构，以及可从工具箱手动新增、每页固定九槽的 CG 模块 |
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

- 当前编辑目标（主界面、CG 画廊合成场景或剧情场景）、节点和编辑模式；
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
- 严格读取已保存 v15、编译 runtime v6，并以 staging/hash/rename 导出内容包；
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
- 作者 `SceneNode` 八种判别类型，其中 `StoryExtensionNode` 只用于编辑分段；
- ID 生成、全局唯一性和引用完整性；
- 场景、对白语音、背景、人物、BGM、视频、选项和跳转操作；
- 项目级 `StartScreen` 独立标题、背景图片/音乐引用的校验、no-op 判断和原子更新；
- 项目级 `CgGallery` 固定页面/槽位、跨页唯一图片引用的完整替换、资源类型校验、no-op 判断和原子更新；
- 混合时间线原子删除与重排；
- 入口场景和被跳转引用场景的保护规则；
- no-op 判断和候选对象提交。

当前导出先复用 Core 已有的 v15 保存与 revision 边界，再由 Main 的 TypeScript 编译器
生成 runtime v6，没有新增 C++ export 命令。未来原生 Runtime、命令行工具或 WASM
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
    ChoiceNode,
    StoryExtensionNode>;

struct ProjectAggregate {
  Project project;
  std::vector<Asset> assets;
};
```

`Project` 还包含独立于剧情场景列表的项目级 `StartScreen`：

```cpp
struct StartScreen {
  std::string title;
  std::optional<std::string> background_asset_id;
  std::optional<std::string> music_asset_id;
};
```

它保存 Player 标题页所需的独立标题和两个资源引用，不是 `SceneNode`，也不会进入
`Project.scenes` 或参与剧情跳转。

同级的 `CgGallery` 保存作者明确创建的页面和固定图片槽位：

```cpp
struct CgGalleryPage {
  std::array<std::optional<std::string>, 9> image_asset_ids;
};

struct CgGallery {
  std::vector<CgGalleryPage> pages;
};
```

`pages` 至少包含一页，每页 `image_asset_ids` 精确九项；每项是图片 Asset ID 或空槽，
所有非空 ID 跨页唯一且指向现有 image Asset。它同样不是 Scene，也不会参与剧情时间线。

八种作者节点共享 `Scene.nodes` 的唯一顺序；前七种进入 Runtime：

- `Dialogue`：玩家可见的对白停顿点，可选绑定一次性人物语音；
- `BackgroundNode`：设置图片或显式切换为无背景；
- `CharacterNode`：设置/清除某人物层，并可用可空百分比坐标覆盖左/中/右预设；
- `SceneJumpNode`：切换到稳定 Scene ID；
- `BgmNode`：循环播放或停止持续生效的背景音乐；
- `VideoNode`：阻塞播放视频，结束或按 Enter 跳过后返回下一条时间线节点；
- `ChoiceNode`：包含零个或多个稳定 ID 的选项；空节点跳过，非空节点等待玩家选择；
- `StoryExtensionNode`：只控制 Blockly 分段，导出前剥离。

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

作者可从 Toolbox 主动插入“延伸”积木，把 Blockly 投影切成横向排列的多个可读段。
延伸是新列的页首：顶部不接上一列，底部向下连接本页剧情。白色数字字段显示
“延伸 1 / 延伸 2…”，输入目标序号会原子移动该延伸及其后直到下一延伸前的整段，
随后按权威时间线重新编号；数字本身不单独持久化。没有延伸时，即使剧情很长也保持
一条链。`SceneJumpNode` 仍会直接终止当前段。延伸从作者项目 v12 起成为可创建、可删除但
不能单块拖动的稳定编辑实体，没有游戏行为；表单会过滤它，导出器也会在生成 runtime v6
时剥离它。

### 8.1 软件托管的主界面合成场景

主界面在 Editor 场景选择器中固定排在“场景 1”之前，但它是 Renderer 提供的
synthetic scene（合成场景），使用保留 ID，仅作为编辑入口，不会伪造成普通 Scene
写入 `project.scenes`。新建项目、打开项目和 Editor 首次加载完成后都默认选中它。

主界面同时提供表单编辑和独立 Blockly 工作区。Blockly 固定投影为：

```text
主界面游戏名 [可填写]（根积木）
└── 界面内容
    ├── 背景图片
    └── 背景音乐
```

三个积木由软件管理，不能移动、删除、改写结构或打开上下文菜单。根积木提供白色
游戏名输入框；背景与音乐子积木
提供白色资源下拉框，第一项固定为“无”，也支持把对应类型的资源直接拖入；不再提供
单独的“清除背景/清除音乐”按钮。表单模式使用独立游戏名输入框和两个同样以“无”为首项的白色选择框，
并显示标题页设计预览。两种视图都经 `startScreen.update` IPC 请求 C++ 原子更新
`project.startScreen`。主界面标题与项目名彼此独立；新建或迁移旧项目时以项目名初始化，
此后项目重命名不会覆盖它。C++ 校验标题非空、背景只能引用图片、音乐只能引用音频，
失败不修改 Project，相同值不增加 revision。切换模式、场景、保存或预览前都会等待当前草稿更新完成。

### 8.2 软件托管的 CG 画廊合成场景

CG 画廊在场景选择器中作为另一个保留 ID 的 synthetic scene 独立出现，不写入
`project.scenes`，也不是可被剧情跳转的运行场景。它持久化到项目级
`project.cgGallery.pages[].imageAssetIds`：至少保留一页，每页精确九个 `string | null`
槽位，所有非空 ID 跨页只能出现一次且必须引用图片资源。页面顺序和空槽位置都会进入
作者文件及 Player。C++ Core 通过 `cgGallery.update` 一次性校验并原子替换完整页面数组；
失败不改变 Project，相同数组不增加 revision。

表单编辑器提供“新增一页/删除本页”、页选择器、固定九格预览和九个图片下拉框；
图形化编辑器使用独立 Blockly 工作区，作者从 CG Toolbox 拖入一个大模块才会新增页面，
已提交模块不能移动，且只在至少保留一页的前提下可删除。每个模块内部固定九个白色
图片下拉框，“无”会把该槽保存为 `null`，后续槽位不会前移。页码由页面数组顺序自动投影。
同一图片若在另一个槽位重新选择，会移动到新槽而不是产生重复引用。CG 编辑状态下资源面板
只展示已导入图片，点击或拖拽不会直接加入画廊，作者必须在当前页的明确槽位中选择。
切换模式、场景、保存或开始预览前，同样会等待当前 CG 更新提交完成。

Player 主界面按钮固定按“开始游戏 / CG 画廊 / 选项 / 退出游戏”纵向排列。画廊每页固定
显示九格，空槽显示“无”，提供上一页/下一页；点击非空缩略图打开大图。Esc 在大图打开时先关闭大图，
再次按下才关闭画廊返回主界面。Editor 从 CG 合成场景启动预览时，会显示完整主界面，
便于通过同一条正式入口检查画廊。

完整字段、编辑投影、Player 交互和导出闭包见 [CG 画廊实现](./cg-gallery-implementation.md)。

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

当前 Writer 写 `fileVersion: 15`，Reader 支持 v1–v15。v9 曾新增严格序列化的
ChoiceNode/ChoiceOption；v10 新增 exact-fields 的 `project.startScreen` 背景和音乐，
v11 为它新增独立 `title`。Reader 打开 v1–v9 时将两项媒体迁移为 `null`；打开
v1–v10 时用 `project.name` 初始化标题。v12 新增只属于作者项目的手动延伸节点；
v13 为人物节点新增可空百分比 `position`；v14 首次以扁平
`project.cgGallery.imageAssetIds` 新增画廊。v15 改为固定九槽的 `pages`；Reader 打开
v14 时按原顺序每九张分成一页并用 `null` 补满最后一页，打开 v1–v13 时生成一张全空页。
Writer 再保存时统一写 v15。

详见 [项目文件夹存储与媒体资源实现](./project-folder-storage.md)。

## 10. 游戏预览

当前 Editor 的普通剧情预览是 TypeScript 纯状态机：从当前选中的剧情场景开始，自动执行背景、
人物、BGM 和场景跳转，遇到对白时暂停；遇到非空 VideoNode 时进入阻塞播放，
视频 ended 或按 Enter 跳过后才继续；遇到非空 ChoiceNode 时进入 `choosing`，
点击选项后跳到其目标场景。空 ChoiceNode 直接跳过。

场景跳转和选项跳转都会清空上一场景人物层并加载目标场景初始背景，同时保留
BGM。运行时使用
访问位置集合检测“没有对白可停留”的跳转循环。预览会话不写回 C++ Project、
revision 或磁盘，也不会改写正式游戏使用的 `entrySceneId`。选择主界面或 CG 画廊后点击预览则
先显示与 Player 共用的完整标题页；其中“开始游戏”按正式入口从 `entrySceneId` 进入剧情，
“CG 画廊”按作者数组顺序展示图片，
“退出游戏”、Esc 和右上角关闭都只退出 Editor 预览，不会退出 Editor 进程。独立 Player
同样先显示主界面，点击“开始游戏”后才从 `entrySceneId` 进入剧情。

详见 [游戏顺序预览](./game-preview-runtime.md)、
[视频播放积木](./video-playback-block.md) 与
[场景跳转实现](./scene-jump-implementation.md)，以及
[选项分支实现](./choice-branch-implementation.md)。

### 10.1 Runtime Bundle、独立应用导出与 Player

Editor Renderer 点击“导出”后，先提交草稿、等待 Engine 队列并走既有 C++ 保存
链。只有 `hasStorage=true`、`isDirty=false` 且 `savedRevision===revision` 时，Main
才稳定读取已保存的 v15 清单，严格编译 runtime v6，只复制剧情、主界面及 CG 画廊非空槽引用媒体，并在目标
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

Player Reader 同时接受 runtime v1–v6：v1 缺少主界面配置，v2 只有背景/音乐，
两者都以 `game.title` 补齐标题；v3 加入独立标题，v4 为人物节点加入可空百分比坐标，
v5 以扁平列表加入 `cgGallery`，v6 改为至少一页、每页固定九槽。runtime v5 会按顺序
分块并补 `null`，runtime v1–v4 加载后得到一张全空页。当前 v6 manifest
声明 `playerCompatibility: ">=6 <7"`；模板声明
`runtimeCompatibility: ">=1 <7"`，因此同一模板可以运行六代内容包。标题页会渲染
独立标题和配置背景，循环播放标题音乐，并固定显示“开始游戏 / CG 画廊 / 选项 / 退出游戏”；通用 Player
的“打开其他游戏”位于“选项”内。标题音乐拥有独立的 `<audio>` 生命周期，开始剧情、
切换内容包或卸载标题页时会停止并归零，不与剧情时间线 BGM 共享控制器。

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
│   ├── export/              # v15→runtime v6 编译、staging、manifest 与原子目录发布
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
│       ├── start-screen/    # 软件托管合成场景、表单和固定 Blockly 结构
│       ├── cg-gallery/      # 独立表单/Blockly 画廊编辑、九宫格分页投影
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
├── src/preload.ts            # loadGame/openGame/getMediaUrl/quitGame
├── src/renderer/             # 标题、游戏、暂停、结束与错误页面
├── fixtures/game/            # 开发期受控 runtime v3 内容包
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
