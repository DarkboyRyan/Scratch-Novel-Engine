<!-- 文件职责：说明当前端到端架构；关键内容：Renderer、Preload、Main、C++、Runtime 与存储边界。 -->

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
- 软件托管的主界面合成场景：表单与固定 Blockly 根积木共同编辑标题上方文字、独立游戏标题、背景图片和背景音乐，
  新建、打开项目或启动 Editor 后默认进入该场景，并可预览完整标题页流程；
- 软件托管的 CG 画廊合成场景：表单可手动新增/删除页面并编辑固定九槽，独立 Blockly
  工作区由作者从工具箱加入“每页一个大模块、每模块九个图片下拉框”，并可预览完整主界面与画廊；
- 表单编辑与 Blockly 图形化编辑共享一条剧情时间线；长链只在 Blockly 中按编号“延伸”分页；
- 剧情 Blockly 按剧情、逻辑、变量、音乐、图片和特效分类，支持变量 Set/Change、可嵌套
  If/Else 与固定次数 Repeat；表单以只读树展示结构，正式预览和 Player 执行真实逻辑；
- Editor 顶栏提供全局中文 / English 设置；Main 原子保存偏好并同步所有窗口、原生菜单与
  对话框，Blockly 只原位更新界面标签，作者内容保持原文；
- 项目文件夹新建、保存、打开、dirty 状态和 Cmd/Ctrl+S；
- 未保存项目导入图片/视频/音频，以及 capability 媒体读取；
- 对白语音、时间线 BGM，以及正式预览中的双音轨播放；
- 正式游戏顺序预览、阻塞式视频/选项、点击推进和跳转循环保护；
- 平台无关的共享 Runtime/Player UI，以及只读独立 Electron Player MVP；
- Editor 的 v20→runtime v10 `.vngame` 目录包导出，以及 Player 原生目录选择换包；
- 跨平台 Web Player ZIP 导出：根目录可直接静态部署，浏览器通过 Fetch 加载内嵌
  runtime v10，并用 IndexedDB 保存存档与设置；
- Player 兼容 runtime v1–v10；runtime v10 标题页渲染可编辑标题上方文字、独立标题、自定义背景、循环标题音乐和固定的
  “开始游戏 / 读取游戏 / CG 画廊 / 选项 / 退出游戏”入口；正式 Player 还提供
  3 个手动存档槽、独立快速槽和游戏内底栏；标题页、底栏与暂停菜单共用持久化选项，
  支持主/BGM/语音/视频音量、窗口/全屏和三档窗口尺寸；三档尺寸同时使用
  14/16/18px 的 Player 根字号；CG 画廊保留每页九个固定槽位，
  支持分页、点击放大和 Esc 返回；
- macOS Editor 基于严格 Player 模板的每游戏 `*-macOS.zip` 事务导出；ZIP 内含唯一
  已签名 `.app`，embedded Player 以固定内容启动；
- 通用 Player 正式发布和每游戏三平台构建的 GitHub Actions 门禁代码；
- C++ Core/Backend、IPC、存储、Blockly 和预览的自动测试。

## 2. 技术栈

| 层 | 当前技术 | 主要用途 |
| --- | --- | --- |
| Renderer | React 19、TypeScript 5.9、HTML/CSS | UI、表单草稿、资源条和预览 |
| 图形编辑 | Blockly 13.1 | 分类剧情 Toolbox、变量与 C 形逻辑积木、编号延伸分页、主界面固定结构，以及每页固定九槽的 CG 模块 |
| 桌面边界 | Electron 43、contextBridge、IPC | 窗口、原生菜单/对话框和权限隔离 |
| 本地核心 | C++20、STL、CMake | 领域模型、校验、revision 和持久化 |
| JSON 边界 | nlohmann/json 3.11.3、JSONL | C++ 项目文件与 Main↔C++ 协议 |
| 文件安全 | Node 文件 API、C++ OS 文件 API | 临时工作区、流式复制、fsync、原子替换 |
| 构建打包 | Vite 5、Electron Forge 7、pnpm、GitHub Actions | Electron targets、桌面/Web Player 模板、三平台制品和发布门禁 |
| Web 导出 | Fetch、IndexedDB、Fullscreen API、yazl/yauzl | 浏览器内容加载与本地存储、跨平台流式 ZIP 生成和复验 |
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
Editor 语言通过 typed catalog / React Context 原地更新；它不进入 Project 或 Runtime，
也不以 locale 作为 React key。Blockly 的静态字段、Tooltip、Dropdown 和 Toolbox 分类
原位更新，作者输入字段与 Workspace 实例保持不变。完整实现见
[Editor 中英文切换](./editor-localization-implementation.md)。

### 4.2 Preload

Editor Preload 使用 `contextBridge` 暴露五个窄接口：

```ts
window.vnEngine       // 领域命令
window.vnProjectFiles // 新建、打开、保存和会话状态
window.vnAssets       // 导入图片/视频/音频和申请 capability URL
window.vnGameExport   // 无路径导出模式与安全应用 metadata
window.vnEditorSettings // 全局语言读取、窄 patch 与变更订阅
```

Renderer 看不到 `ipcRenderer`、Node 文件系统、child process 或本机资源路径。

### 4.3 Electron Main

Main 负责：

- 窗口、原生菜单和文件选择器；
- 校验 IPC 来源和参数形状；
- 为每个窗口启动/关闭 C++ 后端；
- 管理请求 ID、Promise、进程退出和错误；
- 管理项目目录、临时工作区和原子发布；
- 严格读取已保存 v20、编译 runtime v10，并以 staging/hash/rename 导出内容包；
- 校验当前平台/架构 Player 模板，在 macOS 私有工作区注入 runtime bundle、更新
  `Info.plist` 并 ad-hoc 签名；用 `ditto` 生成 ZIP、私有解压复验签名后，只发布
  一个不覆盖既有目标的 `*-macOS.zip`；
- 把 C++ 私有 Asset 净化成公开 DTO；
- 提供带能力令牌的安全图片/音频/视频 protocol，以及音频和视频 Range 响应。

Main 不决定“场景是否能删除”或“人物层是否合法”，最终领域规则仍由 C++ 决定。

独立 Player 不启动 C++ 作者后端。它的 Main 还负责可信 frame 的只读内容/存档/设置
IPC、`userData` 下的原子存档与 `PlayerSettingsV2` 设置文件，以及 BrowserWindow
的 workArea 安全尺寸和原生全屏同步。Player Renderer 只发送 exact 非空设置 patch，
不能指定路径或任意窗口宽高。

### 4.4 C++ Backend

Backend 使用 nlohmann/json 处理两种边界：

- JSONL 请求/响应；
- `project.vn.json` 文件 envelope。

它把 method/params 转成 Core 调用，维护 `revision/savedRevision/isDirty`，并返回
完整 Project、公开 Asset 元数据和会话状态。stdout 只写 JSONL，日志必须写 stderr。

### 4.5 C++ Core

Core 是唯一业务权威来源，且不依赖 Electron 或 JSON。它负责：

- `ProjectAggregate = Project + Assets`；
- 作者 `SceneNode` 使用严格判别联合；`StoryExtensionNode` 只用于编辑分段，逻辑 C 形积木
  使用带 owner ID 的隐藏 paired markers；
- ID 生成、全局唯一性和引用完整性；
- 场景、对白语音、背景、人物、人物 sidecar effect、BGM、视频、选项和跳转操作；
- 项目级 `StartScreen` 标题上方文字、独立标题、背景图片/音乐引用的校验、no-op 判断和原子更新；
- 项目级 `CgGallery` 固定页面/槽位、跨页唯一图片引用的完整替换、资源类型校验、no-op 判断和原子更新；
- 变量名/值、32 个项目变量、If/Else 配对、Repeat 次数与 16 层嵌套校验；
- 混合时间线原子删除与重排，控制结构使用专用整棵删除和整体重排；
- 入口场景和被跳转引用场景的保护规则；
- no-op 判断和候选对象提交。

当前导出先复用 Core 已有的 v20 保存与 revision 边界，再由 Main 的 TypeScript 编译器
生成 runtime v10，没有新增 C++ export 命令。未来原生 Runtime、命令行工具或 WASM
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
    StoryExtensionNode,
    VariableSetNode,
    VariableChangeNode,
    LogicIfNode,
    LogicElseNode,
    LogicEndIfNode,
    LogicRepeatNode,
    LogicEndRepeatNode>;

struct ProjectAggregate {
  Project project;
  std::vector<Asset> assets;
};
```

`Project` 还包含独立于剧情场景列表的项目级 `StartScreen`：

```cpp
struct StartScreen {
  std::string title;
  std::string eyebrow;
  std::optional<std::string> background_asset_id;
  std::optional<std::string> music_asset_id;
};
```

它保存 Player 标题页所需的标题上方文字、独立标题和两个资源引用，不是 `SceneNode`，也不会进入
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

十七种作者节点共享 `Scene.nodes` 的唯一顺序；除延伸外都进入 runtime v10。人物特效是
CharacterNode 的 sidecar value，不增加第十八种时间线节点：

- `Dialogue`：玩家可见的对白停顿点，可选绑定一次性人物语音；
- `BackgroundNode`：设置图片或显式切换为无背景；
- `CharacterNode`：`mode:'show'|'clear'` 明确区分显示/待选图占位与清除某人物层，
  可用百分比坐标覆盖左/中/右预设，并可在执行时发出一次震动、跳跃、呼吸、闪烁、
  淡入、淡出或滑入 effect；
- `SceneJumpNode`：切换到稳定 Scene ID；
- `BgmNode`：循环播放或停止持续生效的背景音乐；
- `VideoNode`：阻塞播放视频，结束或按 Enter 跳过后返回下一条时间线节点；
- `ChoiceNode`：包含零个或多个稳定 ID 的选项；空节点跳过，非空节点等待玩家选择；
- `StoryExtensionNode`：只控制 Blockly 分段，导出前剥离。
- `VariableSetNode` / `VariableChangeNode`：设置逻辑值或增减数值变量；
- `LogicIfNode` / `LogicElseNode` / `LogicEndIfNode`：If/Else 的 root 与隐藏配对 markers；
- `LogicRepeatNode` / `LogicEndRepeatNode`：固定次数循环的 root 与隐藏结束 marker。
- `CgDisplayNode` / `CgEndDisplayNode`：先显示图片、等待整数毫秒，再在 CG 上播放
  Dialogue-only body 的 root 与隐藏结束 marker。

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
不能单块拖动的稳定编辑实体，没有游戏行为；表单会过滤它，导出器也会在生成 runtime v10
时剥离它。

### 8.1 软件托管的主界面合成场景

主界面在 Editor 场景选择器中固定排在“场景 1”之前，但它是 Renderer 提供的
synthetic scene（合成场景），使用保留 ID，仅作为编辑入口，不会伪造成普通 Scene
写入 `project.scenes`。新建项目、打开项目和 Editor 首次加载完成后都默认选中它。

主界面同时提供表单编辑和独立 Blockly 工作区。Blockly 固定投影为：

```text
主界面游戏名 [可填写]（根积木）
标题上方文字 [可填写]
└── 界面内容
    ├── 背景图片
    └── 背景音乐
```

三个积木由软件管理，不能移动、删除、改写结构或打开上下文菜单。根积木提供白色
游戏名和标题上方文字输入框；背景与音乐子积木
提供白色资源下拉框，第一项固定为“无”，也支持把对应类型的资源直接拖入；不再提供
单独的“清除背景/清除音乐”按钮。表单模式在右侧内容区提供标题上方文字、独立游戏名和
两个同样以“无”为首项的白色选择框，
并显示标题页设计预览。两种视图都经 `startScreen.update` IPC 请求 C++ 原子更新
`project.startScreen`。主界面标题与项目名彼此独立；新建或迁移旧项目时以项目名初始化，
此后项目重命名不会覆盖它。标题上方文字默认是 `A VN ENGINE STORY`；空字符串隐藏该行。
C++ 会 trim 首尾 ASCII 空白，拒绝 NUL 或超过 256 个 UTF-8 字节的值；同时校验标题非空、
背景只能引用图片、音乐只能引用音频，
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

正式 Player 主界面按钮固定按“开始游戏 / 读取游戏 / CG 画廊 / 选项 / 退出游戏”
纵向排列；Editor 整体预览也显示完整菜单，但点击“读取游戏”只显示预览说明，不注入
磁盘存档能力。画廊每页固定
显示九格，空槽显示“无”，提供上一页/下一页；点击非空缩略图打开大图。Esc 在大图打开时先关闭大图，
再次按下才关闭画廊返回主界面。Editor 从 CG 合成场景启动预览时，会显示完整主界面，
便于通过同一条正式入口检查画廊。

完整字段、编辑投影、Player 交互和导出闭包见 [CG 画廊实现](./cg-gallery-implementation.md)。

### 8.3 剧情逻辑积木

剧情工作区用 `variableSet` / `variableChange` 保存叶节点，用
`logicIf → logicElse → logicEndIf` 和 `logicRepeat → logicEndRepeat` 保存扁平配对控制
结构，再投影成 Blockly C 形积木。新增配对、整棵删除和整体移动均通过专用 C++ 命令
原子完成，通用 timeline 命令不能拆散 marker；“延伸”也不能放进控制体或切开控制结构。

逻辑值只允许布尔值、有限数字和最多 4096 UTF-8 bytes 的字符串。变量名最多 64 UTF-8
bytes，整个项目最多 32 个不同变量，Repeat 为 1–1000 次，逻辑最多嵌套 16 层。表单只
显示缩进的 Then/Else/body 树和只读摘要；静态画面预览经过第一个控制结构后冻结在最后的
确定状态，正式预览才使用真实变量求值。共享 Runtime 每次推进最多自动执行 10000 步，
避免控制流或跳转组合卡死。完整模型、协议、存档和测试见
[逻辑 Blockly 实现](./logic-blockly-implementation.md)。

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

当前 Writer 写 `fileVersion: 20`，Reader 支持 v1–v20。v9 曾新增严格序列化的
ChoiceNode/ChoiceOption；v10 新增 exact-fields 的 `project.startScreen` 背景和音乐，
v11 为它新增独立 `title`。Reader 打开 v1–v9 时将两项媒体迁移为 `null`；打开
v1–v10 时用 `project.name` 初始化标题。v12 新增只属于作者项目的手动延伸节点；
v13 为人物节点新增可空百分比 `position`；v14 首次以扁平
`project.cgGallery.imageAssetIds` 新增画廊。v15 改为固定九槽的 `pages`；Reader 打开
v14 时按原顺序每九张分成一页并用 `null` 补满最后一页，打开 v1–v13 时生成一张全空页。
v16 新增变量 Set/Change、条件 AST 和 If/Else/Repeat paired markers；v17 新增显示 CG
的 paired range；v18 为 CharacterNode 新增严格可空 sidecar effect；v19 新增
`mode:'show'|'clear'`；v20 为 `project.startScreen` 新增 `eyebrow`。Writer 再保存时统一写
v20；v1–v19 的标题上方文字迁移为 `A VN ENGINE STORY`；旧 v1–v17 人物迁移为
`effect:null`，旧 v1–v18 再按 assetId 推导 mode，旧版伪造字段会被拒绝。

v19 的 `show + assetId:null` 是可持久化的待选图占位，Editor 预览将其过滤为 no-op；
导出器以稳定错误拒绝未完成节点，绝不把它投影成 Runtime v10 的 clear。只有显式
`mode:'clear'` 才清层，且其 assetId、position、effect 必须全为 null。

旧项目未另存时也可以直接导出。v1–v13 的磁盘字节先由窗口独享的 C++ Reader 迁移并
聚合校验，Main 再以保存时记录的 manifest SHA 绑定该 canonical 快照；Asset 路径仍取自
原文件并经过 v20 Compiler 的 strict 校验。v14–v20 继续直接走严格 Compiler，未来版本
和投影不一致均 fail closed，导出不会为兼容而改写作者项目。旧 scene-level 初始人物
不在 Renderer 投影内，因此会明确要求作者改用 Character 时间线节点，而不会被静默删除。

详见 [项目文件夹存储与媒体资源实现](./project-folder-storage.md)。

## 10. 游戏预览

当前 Editor 的普通剧情预览是 TypeScript 纯状态机：从当前选中的剧情场景开始，自动执行背景、
人物（含一次性 sidecar effect）、BGM、变量和控制结构以及场景跳转，遇到对白时暂停；遇到非空 VideoNode 时进入阻塞播放，
视频 ended 或按 Enter 跳过后才继续；遇到非空 ChoiceNode 时进入 `choosing`，
点击选项后跳到其目标场景。空 ChoiceNode 直接跳过。

场景跳转和选项跳转都会清空上一场景人物层并加载目标场景初始背景，同时保留
BGM。Runtime 预编译 paired markers，使用变量表和显式 Repeat 栈执行逻辑；每次推进的
自动步骤预算为 10000，超过时进入 `logicStepLimit`，避免“没有阻塞点”的控制流卡死。
人物图片 load/decode 后才启动一次性 effect；全局单调特效序号保证 Repeat 再次执行仍会
播放。暂停、阻塞弹层与页面隐藏保留 CSS animation 进度，reduced motion 只取消动画而不
改变最终 opacity；表单时间线只展示静态最终状态。
预览会话不写回 C++ Project、
revision 或磁盘，也不会改写正式游戏使用的 `entrySceneId`。选择主界面或 CG 画廊后点击预览则
先显示与 Player 共用的完整标题页；其中“开始游戏”按正式入口从 `entrySceneId` 进入剧情，
“CG 画廊”按作者数组顺序展示图片，
“退出游戏”、Esc 和右上角关闭都只退出 Editor 预览，不会退出 Editor 进程。独立 Player
同样先显示主界面，点击“开始游戏”后才从 `entrySceneId` 进入剧情。

详见 [游戏顺序预览](./game-preview-runtime.md)、
[视频播放积木](./video-playback-block.md) 与
[场景跳转实现](./scene-jump-implementation.md)，以及
[选项分支实现](./choice-branch-implementation.md)和
[人物立绘特效实现](./character-portrait-effects.md)。

### 10.1 Runtime Bundle、Web/独立应用导出与 Player

Editor Renderer 点击“导出”后，先提交草稿、等待 Engine 队列并走既有 C++ 保存
链。只有 `hasStorage=true`、`isDirty=false` 且 `savedRevision===revision` 时，Main
才稳定读取已保存的 v20 清单，严格编译 runtime v10，只复制剧情、主界面及 CG 画廊非空槽引用媒体，并在目标
父目录使用排他锁、staging、SHA-256、fsync 和原子 rename 发布 `.vngame` 目录。
Renderer 不传入或接收本机路径。

导出弹层提供三种模式。内容包模式直接发布 `.vngame`；独立应用模式额外接受应用名、
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

Web 模式不接受桌面应用 metadata，而是把预构建的 Vite Web Player 模板与同一份
Runtime Bundle 组装为 `<项目名>-Web.zip`。ZIP 根目录固定包含 `index.html`、
`web-export.json`、`README.txt`、`player-assets` 和 `game/<buildId>`；Main 使用
`yazl` 流式生成、再用 `yauzl` 重新读取并校验条目后原子发布。浏览器只从 exact v1
元数据取得同源相对 `gameRoot`，通过 Fetch 加载并严格解析 `game.json`/`manifest.json`；
存档和设置写入 IndexedDB，窗口尺寸禁用，全屏使用 Fullscreen API，退出返回标题页。
完整流程、技术栈、部署限制与验收矩阵见
[Web Player ZIP 导出](./web-player-export.md)。

packaged Player 是不内嵌 fixture 的通用空壳。`openGame()` 只请求 Main 弹出原生
目录选择器；候选包全部验证成功后才 commit 并轮换 `vn-game-asset://` token。
取消或坏包会保留旧游戏。embedded Player 检测固定 `Resources/game`，严格加载后
禁用换包入口；坏 embedded 内容保持只读错误状态，不降级成通用选择器。开发模式仍
自动加载受控 fixture。

Player Reader 同时接受 runtime v1–v10：v1 缺少主界面配置，v2 只有背景/音乐，
两者都以 `game.title` 补齐标题；v3 加入独立标题，v4 为人物节点加入可空百分比坐标，
v5 以扁平列表加入 `cgGallery`，v6 改为至少一页、每页固定九槽，v7 加入变量和配对
逻辑节点，v8 加入显示 CG paired range，v9 为人物节点加入严格可空 sidecar effect，
v10 为 `game.startScreen` 加入 `eyebrow`。
runtime v5 会按顺序分块并补 `null`，runtime v1–v4 加载后得到一张全空页；runtime
v1–v8 的人物特效迁移为 `null`；runtime v1–v9 的标题上方文字迁移为
`A VN ENGINE STORY`。当前 v10 manifest 声明 `playerCompatibility: ">=10 <11"`；模板
声明 `runtimeCompatibility: ">=1 <11"`，因此同一模板可以运行十代内容包。标题页会渲染
非空标题上方文字、独立标题和配置背景，循环播放标题音乐，并固定显示“开始游戏 / 读取游戏 / CG 画廊 /
选项 / 退出游戏”；通用 Player
的“打开其他游戏”位于“选项”内。标题音乐拥有独立的 `<audio>` 生命周期，开始剧情、
切换内容包或卸载标题页时会停止并归零，不与剧情时间线 BGM 共享控制器。

正式 Player 的“读取游戏”和游戏内底栏使用外部用户数据目录中的版本化快照，不写回
作者项目或只读 runtime bundle。Renderer 只传小型 `GameRuntimeSnapshot v4`，Main 依据
当前 bundle identity 恢复并校验，固定槽通过临时文件、fsync、备份和 rename 发布。
快照 v4 保存全局特效序号与人物最终 `opacity`/分层序号，恢复时清除瞬时 effect，避免动画重播；
旧 v1–v3 快照仍按各自能力受限恢复，其中 snapshot v3 是显示 CG 状态的历史里程碑。
完整边界、文件格式和技术栈见 [Player 保存与读取](./save-load-implementation.md)。

标题页、游戏内底栏和暂停菜单进入共享 `OptionsDialog`。Player 设置当前使用
`settingsVersion: 2`，新增 `zh-CN / en-US` 界面语言，旧 v1 严格迁移为中文；默认四路
音量均为 1、窗口模式为 windowed、尺寸为 medium。共享 typed catalog 与 React Context
即时更新标题、游戏栏、存读档、CG、视频和无障碍文案，作者剧情内容保持原文；
Main 把 exact 设置写到 `userData/settings/settings.json`，并用临时文件、fsync、备份与
rename 原子发布。窗口预设为 960×600、1280×800、1600×1000，放不下当前 Display
`workArea` 时按比例缩小并居中；原生全屏事件会反写权威模式，全屏转换以 5 秒为上限。
三个预设还分别映射 14px、16px、18px 的 Player 根字号，所有文字层级使用相对单位，
切换时不会重挂剧情或媒体；全屏继续沿用所选预设字号。
隐藏窗口在 `loadURL` 完成后、`show()` 前通过 activation gate 应用持久化显示状态；
该 gate 释放前设置 IPC 不会返回。只有显示字段 patch 才应用窗口几何，纯音量 patch
不会缩放或重新居中用户手动调整的窗口。媒体有效音量统一为 `master × channel`，改变
音量不重建音轨或重置播放位置。选项、存档、CG 画廊和打开失败弹层使用同步 latch
保持互斥，底层界面进入 `inert`，关闭后恢复触发按钮焦点。Editor 标题页预览只保存
组件内存状态并禁用窗口控制。完整契约、安全边界与测试矩阵见
[Player 选项系统](./player-options-implementation.md)。选项功能本身不修改内容格式；当前
内容契约为 author v20、runtime v10 和 `GameRuntimeSnapshot v4`。

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
│   ├── export/              # v20→runtime v10 编译、staging、manifest 与原子目录发布
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
├── src/main/                 # bundle、存档、设置/窗口管理、只读 IPC 与媒体 capability
├── src/preload.ts            # 内容、媒体、存档、设置与退出的 contextBridge 窄 API
├── src/renderer/             # 标题、游戏、保存读取、选项、暂停、结束与错误页面
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

- 复合逻辑表达式、任意脚本、条件选项可见性与选项副作用；
- Undo/Redo；
- 同一项目根的多窗口排他锁；
- Blockly 布局持久化和未引用资源回收；
- `.vngame` 双击/UTI 关联；
- 存档删除、跨内容版本迁移和云同步；
- 文字/自动播放速度、SFX 通道、无边框窗口和 Player 设置云同步；
- GitHub `player-release`/`game-release` protected Environments、required reviewers、
  deployment ref rules、不可变 `player-v*` tag/Release 和 Environment Secrets 的外部
  配置验收；
- GitHub runner 上 Developer ID/公证、Authenticode 与 GPG release set 的首次正式
  执行，以及干净机器安装/卸载验证。

多平台 workflow、每游戏独立应用和 metadata/图标注入代码已经实现；没有真实证书
执行记录时，面试中只能称为“发布流水线实现完成”，不能称为“正式发行完成”。
完整上线清单见[独立游戏导出文档的 GitHub 外部配置](./game-export-player.md#91-上线前必须完成的-github-外部配置)。
