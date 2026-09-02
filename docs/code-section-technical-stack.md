<!-- 文件职责：记录 Code Section 当前完整技术栈；关键内容：剧情 DSL、页面样式 DSL、草稿隔离、IPC、C++ 原子提交与三视图联动。 -->

# Code Section 技术栈与实现

> 实现状态：已完成。当前基线为 Author v22、Runtime v13、Snapshot v5；剧情 DSL
> `story 1` 与页面样式 DSL `style_version: 1` 是独立的编辑协议版本，不等于上述文件版本。

## 1. 功能定位

Code Section 是 Form 和 Blockly 之外的第三个编辑界面。三个界面不各自保存一份剧情，
而是共同读取 C++ `ProjectAggregate` 的权威快照：

| Code 目标 | 当前能力 | 应用后的权威数据 |
| --- | --- | --- |
| 普通剧情场景 | 编辑封闭的故事 DSL，覆盖现有全部时间线节点与嵌套控制结构 | `Scene.name`、初始背景和 `Scene.nodes` |
| 主界面 | 编辑严格白名单页面样式 | `startScreen.style` |
| CG 画廊 | 编辑严格白名单页面样式 | `cgGallery.style` |

剧情源码格式错误、引用歧义或发生权威冲突时，草稿只留在 Code Section 的窗口内存中。
Form、Blockly、静态预览和 Runtime 继续显示最后一次成功应用的 C++ 权威版本，不会看到
半解析内容。有效源码应用成功后，C++ 返回完整项目快照，三个编辑界面再从该快照重建投影。

当前的“自由编辑”指自由组合 Scratch Novel Engine 已有的类型化剧情指令，不是执行任意
JavaScript、Lua、CSS、HTML、选择器或 URL。源码打开和输入期间不会执行代码。

## 2. 技术栈总览

| 层 | 技术 | Code Section 职责 |
| --- | --- | --- |
| UI | React 19、TypeScript、受控 `textarea` | 目标路由、源码编辑、诊断、Apply、Reload、Preview、dirty 与冲突状态 |
| 故事投影 | 纯 TypeScript formatter | `SceneDocument` → canonical `story 1` 源码、诊断和 `sourceRanges` |
| 故事解析 | 手写 Lexer + 递归下降 Parser | 源码 → 嵌套 `SceneContentDraft`，完成值域、引用、预算与结构校验 |
| 页面样式解析 | TypeScript exact-field parser | `main_screen(...)` / `cg_gallery(...)` ↔ 严格样式 DTO |
| Renderer 状态 | React refs/state、single-flight Promise、内存 `Map` | 按项目和目标隔离草稿，区分严格操作与普通离开 |
| Renderer 网关 | `useEngineProject` | 命令串行化、HMR 合同检查、成功快照统一应用 |
| Electron 边界 | typed shared protocol、contextBridge、Main runtime validator | exact fields、尺寸/深度/数量预算、旧 Preload fail-closed |
| Main → C++ | Node 子进程、JSONL、nlohmann/json | 请求关联、响应解析；可能提交的整体替换命令不使用应用层超时 |
| C++ Core | C++20、候选副本、`std::variant` | ID 复用/生成、隐藏 marker 重建、完整聚合校验、一次 swap |
| Author 存储 | Author v22 strict Reader/Writer | 只保存应用后的权威结构和页面样式，不保存 Code 排版草稿 |
| 导出 | Main TypeScript compiler | Author v22 → Runtime v13；剧情节点与页面样式进入既有 Runtime DTO |
| 渲染 | `@vnengine/player-ui`、CSS custom properties | Editor、Desktop Player、Web Player 共用标题页/CG 主题语义 |
| 测试 | Vitest、CTest、真实 C++ JSONL integration | parser round-trip、草稿隔离、IPC exact shape、原子性与兼容迁移 |

当前主要依赖版本为 React/React DOM `^19.2.8`、TypeScript `~5.9.3`、Electron `43.2.0`、
Vite `^5.4.21`、Blockly `13.1.1`、Vitest `3.2.7`、C++20 和 nlohmann/json `3.11.3`。

## 3. 总体数据流

### 3.1 权威快照生成 Code

```text
C++ ProjectAggregate
  -> EngineMutationResult.project
  -> useEngineProject.applyResult
  -> React ProjectDocument
  -> projectSceneToReadonlyCode / format*StyleCode
  -> Code textarea
```

`sceneCodeProjection.ts` 复用 Blockly 的 `parseLogicStructure`，把 C++ 扁平时间线里的
`logicElse`、`logicEndIf`、`logicEndRepeat` 和 `cgEndDisplay` 折叠为作者看到的嵌套块。
投影同时返回：

- `source`：稳定 canonical 源码；
- `sourceRanges`：作者节点/选项 ID 到一基源码行范围的 sidecar 映射；
- `diagnostics`：缺失资源、错误资源类型、缺失场景或非法 marker 结构。

ID 不写进用户源码。`sourceRanges` 只存在于编辑会话，当前用于可靠复用既有身份；
`findDeepestCodeSourceRange` 也提供最深层范围查询能力，为后续源码与其他编辑器的选中联动保留。

### 3.2 剧情 Code 应用到权威项目

```text
textarea source
  -> parseEditableSceneCode
  -> SceneContentDraft
  -> useEngineProject.replaceSceneContent
  -> window.vnEngine.replaceSceneContent
  -> Preload invoke(scene.content.replace)
  -> Main validateEngineInvocation
  -> BackendClient JSONL
  -> C++ Backend exact parser
  -> Core replace_scene_content(candidate aggregate)
  -> full EngineMutationResult
  -> Form / Blockly / Code / Preview reproject
```

Renderer 不会把整段源码拆成若干 `dialogue.add`、`timeline.reorder` 等细粒度命令。
If/Repeat/CG 的中间状态在领域上可能非法，多命令流程还会形成部分成功。专用
`scene.content.replace` 让整个场景只有“全部成功”或“完全不变”两种结果。

### 3.3 页面样式应用与渲染

```text
main_screen(...) / cg_gallery(...)
  -> parseSurfaceStyleCode
  -> StartScreenStyleDocument / CgGalleryStyleDocument
  -> startScreen.style.update / cgGallery.style.update
  -> Author v22 style DTO
  -> AuthorProjectCompiler
  -> Runtime v13 style DTO
  -> @vnengine/player-ui pageTheme
  -> trusted CSS variables + data-layout
```

页面源码不会直接插入 `<style>`。`pageTheme.ts` 把 enum、受界整数和规范颜色转换为受信任的
CSS custom properties 与 `data-*` 布局值，Editor 预览、Desktop Player 和 Web Player
消费相同 DTO。

### 3.4 textarea 编辑交互

剧情和两个页面样式目标共用 `codeTextareaEditing.ts`。缩进单位与 canonical
formatter 一致，固定为两个空格：

- Tab 在光标处插入一级缩进；选中多行时按行整体缩进；
- Shift+Tab 删除每行最多两个前导空格，并兼容粘贴进来的 Tab 字符；
- Enter 继承当前行前导空白，在左括号后增加一级，位于 `{}` / `()` / `[]`
  之间时一次展开内外两行；
- pending selection 由 `useLayoutEffect` 在受控 textarea 重渲染后恢复，同时保留选区方向和滚动位置；
- IME composition 和 Ctrl/Meta/Alt 修饰键不拦截。先按 Esc 再按 Tab/Shift+Tab 可移出
  textarea，避免键盘焦点陷阱。

## 4. 剧情 DSL

### 4.1 文档结构

每个剧情 Code 目标只编辑一个 `project.scenes` 中的真实场景。主界面和 CG 画廊分别使用
`vn-editor:start-screen` 与 `vn-editor:cg-gallery` 这两个 Renderer synthetic surface ID，
它们不进入 `project.scenes`。剧情源码固定以 `story 1` 开头，且初始背景是场景块中第一条
必需声明：

```text
story 1

scene("Wake Up") {
  background(image("assets/images/Bedroom"), scale: 80, initial: true)

  say("What happened?", speaker: "Gregor")
  show(image("assets/images/Gregor"), at: right, layer: 2, scale: 90,
       effect: shake(600ms, normal))
}
```

解析成功后会重新投影为 canonical 格式，因此任意空格和换行排版不作为项目数据保留。
当前语法不支持注释；作者语义会持久化，原始排版不会持久化。

### 4.2 指令覆盖

| 作者能力 | DSL 形式 | 主要参数 |
| --- | --- | --- |
| 对白 | `say("text", ...)` | `speaker`、`voice`；speaker/text 可为空 |
| 初始/时间线背景 | `background(...)` | image/none、10–300 的 `scale`、初始项 `initial: true` |
| 显示立绘 | `show(...)` | image/pending、预设或精确位置、slot、layer、scale、effect |
| 清除立绘 | `clear(layer: N)` | 1–10 层 |
| 场景跳转 | `jump(scene("Name"))` | 唯一场景显示名，自跳转拒绝 |
| BGM | `bgm(audio(...))` / `bgm(stop)` | 音频逻辑路径 |
| 视频 | `play(video(...))` | 视频逻辑路径或 pending |
| 选项 | `choice { option(...) }` | 文本与目标场景 |
| 设置变量 | `set($name, value: ...)` | 字符串、有限数字或布尔值 |
| 增减变量 | `change($name, amount: ...)` | 有限数字 |
| 条件 | `if (...) { ... } else { ... }` | 变量/字面量与六种比较运算符 |
| 固定循环 | `repeat(N) { ... }` | 1–1000 次，可嵌套 |
| 剧情 CG | `cg(image(...), lead: Nms) { ... }` | 0–60000ms，body 只能包含 `say` |
| Blockly 延伸页 | `pagebreak()` | 只能位于根层级 |

人物特效仍是类型化 sidecar：`fadeIn`、`fadeOut`、`slideIn`、`shake`、`jump`、
`breathe`、`flash`；持续时间、强度和滑入方向均沿用 Author/Core 的已有值域。

### 4.3 资源和场景引用

源码不展示 Asset ID 或 Scene ID：

```text
image("assets/images/Bedroom")
audio("assets/audio/Voice")
video("assets/videos/Opening")
scene("Next Scene")
```

资源路径是由公开 `AssetDocument.type + displayName` 生成的逻辑展示路径，不是真实项目相对
路径，更不是主机绝对路径。危险字符按 UTF-8 byte `%XX` 转义；该字符串不得传给文件系统、
导出器或媒体读取 API。新导入资源会在同类型显示名重名时追加 ` (2)`、` (3)`。

旧项目仍可能存在同类型同显示名资源或同名场景，因此 parser 只在唯一匹配时解析名称。
对于源码中未改变且 `sourceRanges` 能证明既有 identity 的引用，可继续保留原 ID；新增引用，
或移动且编辑后同时失去 unchanged-line 与 structural-path 身份证据的歧义引用会返回
`ambiguousReference`，绝不按顺序猜测。

### 4.4 身份保留

`SceneContentDraftNode` 与 Choice option 可携带可选 `originId`，但它来自会话 sidecar，不来自
用户输入。身份匹配只接受两类证据：

1. 源码行仍能通过上次 projection 的 `sourceRanges` 对应同类型作者项；
2. 同类型作者项仍位于完全相同的结构路径。

没有可靠证据的新项不携带 `originId`，由 C++ 生成全局唯一 ID。parser 不使用“找一个未占用的
同类型旧节点”这种猜测，避免新节点借用旧 identity 绕过资源/场景重名诊断。

## 5. 剧情 parser 与安全预算

`sceneCodeParser.ts` 使用手写 Lexer 和递归下降 parser，而不是 `eval`、正则替换或通用脚本
解释器。Lexer 接受标识符、有限数字、JSON 字符串、固定符号和比较运算符；其余 token
立即形成源码诊断。

Parser 在 Renderer 中提供即时反馈，Main 与 C++ 再独立校验同一安全边界，不能信任
Renderer 已经检查过的数据：

| 边界 | Renderer story parser | Main / C++ replace boundary |
| --- | --- | --- |
| 源码/草稿尺寸 | 源码最多 512 KiB UTF-8 | 序列化 draft 最多 2 MiB |
| 实体总数 | node + choice option 最多 10,000 | 最多 10,000，数组分配前检查剩余预算 |
| 控制嵌套 | 最多 16 层 | 最多 16 层 |
| 项目变量 | 最多 32 个不同名称 | C++ 全项目聚合重新校验 |
| 变量名 | 非空、无 NUL、ASCII trim 后不变、最多 64 UTF-8 bytes | Author/Core 再校验 |
| 逻辑字符串 | 最多 4096 UTF-8 bytes | Author/Core 再校验 |
| 场景名 | 非空、无首尾 ASCII 空白、最多 4096 UTF-8 bytes | Main/JSONL 检查 NUL 与长度；Core 归一并拒绝空名 |
| speaker | 最多 4096 code units | Story parser 与 AuthorProjectCompiler 对齐；C++ 仍受 2 MiB draft 总预算 |
| 选项文字 | 非空、无首尾 ASCII 空白、最多 64 Ki code units | Core 复核非空/trim/target；Compiler 复核 64 Ki 上限 |
| 数字 | finite；整数/范围字段拒绝小数和越界 | Main exact validator + C++ Core |
| CG body | parser 只接受 `say` | Backend 在进入通用递归前即检查 dialogue |

诊断返回稳定 `code`、一基 `line/column`，并可附带 `field` 或 `reference`。中英文 UI 根据
诊断 code 本地化；底层英文 `message` 仅用于开发调试。Story parser 对首个 fatal error
fail-fast；页面样式 parser 可以聚合多条字段诊断。

## 6. C++ 原子场景替换

### 6.1 DTO

`SceneContentDraft` 包含：

- `name`；
- `initialBackground: { assetId, scalePercent }`；
- 嵌套 `nodes`。

If 使用 `thenNodes/elseNodes`，Repeat 和 CG 使用 `bodyNodes`。作者不可直接提交
`logicElse`、`logicEndIf`、`logicEndRepeat` 或 `cgEndDisplay`；这些隐藏 marker 由 Core
重建。

### 6.2 提交流程

Core 的 `replace_scene_content` 按以下顺序工作：

1. 从原 aggregate 读取当前场景，在旁路 builder 中校验每个 `originId` 属于当前场景、
   类型一致且全草稿未重复；
2. 为新增节点、选项和 paired marker 生成全项目唯一 ID；
3. 复用合法 control root 对应的旧 marker ID；
4. 把嵌套 If/Repeat/CG 展开为扁平 replacement 时间线；
5. 复制 aggregate，把新 name、初始背景和 replacement nodes 安装到 candidate；
6. 校验场景名、结构、目标场景、资源存在性/类型、变量预算和全局 ID；
7. candidate 与原项目相同则返回 no-op；否则 Core 以 move assignment 一次提交 candidate，
   Backend 随后通过 `record_mutation(true)` 推进一个 revision。

任一步失败，权威 aggregate 和 revision 都不变。ID generator 可能留下不可见的编号间隙，
但不会产生可观察的项目实体或部分场景。

Main 的 `BackendClient` 不对 `scene.content.replace` 设置 10 秒应用层 timeout：命令一旦交给
C++ 就可能在 Main 放弃等待后完成提交。保持请求 pending 到响应或进程关闭，可以避免 UI
先报告失败、稍后又出现隐藏成功的状态分裂。

## 7. 草稿、Apply 与三编辑器联动

### 7.1 草稿状态

`App.tsx` 持有窗口级 `Map<string, CodeEditorDraft>`。key 按目标隔离：

```text
<sessionEpoch>:<projectId>:story:<sceneId>
<sessionEpoch>:<projectId>:start-screen
<sessionEpoch>:<projectId>:cg-gallery
```

草稿只保存 `{ source, baseSource }`。`baseSource` 是开始编辑时的权威 canonical 源，
用于判断外部权威变化。成功打开另一项目后清空 Map 并推进 `sessionEpoch`，即使新旧工程
复用了同一个 project ID，也不会恢复上一会话的草稿；取消打开或打开失败时保留。草稿不跨
应用重启，也不进入 Author/Runtime/ZIP。

### 7.2 Apply single-flight

Story 与页面样式 panel 都使用 `activeMutationRef`：

- 同时点击 Apply、保存或切换目标时复用同一个 Promise；
- pending 期间 textarea 和操作按钮禁用；
- backend false/reject 保留源码和 dirty；
- 成功但 React 权威快照尚未回流时，以 pending-authority guard 避免误报冲突；
- 若提交期间出现第三份权威值，则保留草稿并进入 conflict，不用旧响应覆盖新权威。

成功后以解析出的 DTO 重新格式化 canonical source，清除草稿，再等待完整 C++ 快照驱动
Form/Blockly/Code 一致重投影。

### 7.3 “离开”与“严格操作”是两条边界

普通离开使用 `prepareToLeave()`：

- clean：直接离开；
- valid dirty：先 Apply，成功后离开；
- invalid/conflict：草稿写入内存 Map，允许离开；
- 有效源码但 Backend 提交失败：不离开，保留错误信息和草稿。

因此错误格式不会显示在 Form/Blockly，也不会把用户锁死在 Code 页面。

保存、导出、正式预览和资源导入使用 `flushPendingDraft()` 加全局草稿检查：当前有效草稿先
Apply；当前或其他目标仍有 invalid/conflict 草稿则整个操作返回 false。该策略避免作者以为
错误 Code 已进入发布包，实际却静默使用旧权威内容。

### 7.4 conflict

当 dirty 草稿的 `baseSource` 与最新权威 canonical source 不同，Code Section 显示冲突：

- 不自动覆盖本地源码；
- 不允许 Apply 到新权威之上；
- Form/Blockly 仍显示新权威；
- 作者可“重新载入已应用代码”明确丢弃本地草稿。

第一版不提供自动三方 merge 或 force overwrite。

## 8. 主界面与 CG 样式 DSL

页面 Code 使用完全独立的白名单语法：

```text
main_screen(
  style_version: 1,
  font: system,
  font_scale: 100,
  page: "#0B0C0F",
  text: "#FFFFFF",
  muted_text: "#B8BCC6",
  surface: "#0C0F14",
  surface_opacity: 0,
  accent: "#FFFFFF",
  overlay: "#040609",
  overlay_opacity: 44,
  radius: 0,
  layout: split-right,
  background_fit: contain
)
```

CG 使用 `cg_gallery(...)`，页面专用字段为 `layout: framed | edge-to-edge`、
`thumbnail_fit: contain | cover` 和 `gap: 0..32`。共用字段包括四种内置 font、75–150 的
`font_scale`、规范 `#RRGGBB` 色值、0–100 透明度和 0–48 圆角。

解析器要求所有字段恰好出现一次，拒绝未知、重复、缺失、非法 enum/颜色、越界整数、错误
wrapper 和超过 16 KiB 的 UTF-8 源文。`startScreen.style.update` 与
`cgGallery.style.update` 只替换 style，不重建标题内容、背景/音乐、CG 页或槽位。

Author v1–v21 与 Runtime v1–v12 Reader 会补当前默认 style；Author v22 和 Runtime v13
开始严格持久化。样式不是游戏进度，Snapshot 继续为 v5。

## 9. 进程与信任边界

### 9.1 Renderer

Renderer 可以访问公开 Project DTO、Asset ID/类型/显示名和 Preload 方法，但不能访问真实
资源 relativePath、主机文件路径、Node API 或 C++ 内存。Code 文本仅在这里解析为 DTO，
不能直接成为 IPC method、文件路径或 HTML/CSS。

### 9.2 Preload/HMR

Preload 暴露最小 `VnEngineApi`。两个合同 marker 分别保护：

- `storyCodeContractVersion: 1`；
- `surfaceStyleContractVersion: 1`。

若 Renderer 在 HMR 后连接到旧 Preload，`useEngineProject` 会在调用前拒绝写入并提示完全重启。
若新 Preload 连接到旧 Main，Main 的独立 method/shape validator 会拒绝未知请求；合同 marker
本身不负责识别该方向的版本差异。

### 9.3 Main 与 C++

Main `validateEngineInvocation` 使用 exact-shape runtime guard；C++ Backend 用独立
nlohmann/json exact parser 再验证一次。两层都限制递归、实体和尺寸，C++ 不能依赖
Electron 已过滤输入。Backend stdout 只输出 JSONL 响应，诊断写 stderr。

### 9.4 明确禁止

Code Section 当前不支持：

- 任意 JavaScript、Lua、CSS、HTML、DOM、选择器或 `url()`；
- include/import、网络、文件系统路径、环境变量或动态模块；
- 任意无限循环、函数调用、时间、随机数或执行期代码生成；
- 直接编辑 Asset ID、Scene ID、hidden marker ID 或 Author JSON；
- 保存任意源码注释、排版，或把 invalid 草稿打进导出包。

## 10. 版本与持久化矩阵

| 数据 | 当前版本 | Code Section 关系 |
| --- | --- | --- |
| Story DSL | `story 1` | 会话级编辑协议；应用后降级为既有 Author 节点，不单独持久化 |
| Style DSL | `style_version: 1` | 会话级样式编辑协议；应用后保存 typed style DTO |
| Author Project | v22 | 保存权威剧情结构和两套 page style；不保存 Code source |
| Runtime Project | v13 | 保存编译后的剧情语义和两套 page style；不包含 Code source |
| Game Snapshot | v5 | 保存游戏进度与画面状态；不保存编辑草稿或页面样式 |
| Preload story contract | v1 | 防止旧 Electron 边界接收 `scene.content.replace` |
| Preload style contract | v1 | 防止旧边界接收 page style 命令 |

仅增加新的 Code 写法但最终仍编译成现有 Author 节点时，可提升 DSL parser/formatter 合同而不必
提升 Runtime/Snapshot。新增新的 Author 节点语义时必须评估 Author 与 Runtime 版本；若新语义
影响可恢复游戏状态，还必须评估 Snapshot 版本。

## 11. 主要实现文件

### Renderer

- [CodeEditor](../apps/editor/src/renderer/features/code-editor/CodeEditor.tsx)
- [故事投影](../apps/editor/src/renderer/features/code-editor/sceneCodeProjection.ts)
- [故事 parser](../apps/editor/src/renderer/features/code-editor/sceneCodeParser.ts)
- [源码 formatter/range](../apps/editor/src/renderer/features/code-editor/codeFormatter.ts)
- [textarea 缩进编辑](../apps/editor/src/renderer/features/code-editor/codeTextareaEditing.ts)
- [页面样式 parser/formatter](../apps/editor/src/renderer/features/code-editor/surfaceStyleCode.ts)
- [应用级草稿与路由](../apps/editor/src/renderer/App.tsx)
- [严格保存准备](../apps/editor/src/renderer/projectSavePreparation.ts)
- [Engine hook](../apps/editor/src/renderer/hooks/useEngineProject.ts)

### Electron/shared

- [共享 Author/草稿 DTO](../apps/editor/src/shared/projectTypes.ts)
- [Engine IPC 协议](../apps/editor/src/shared/engineProtocol.ts)
- [Preload bridge](../apps/editor/src/preload.ts)
- [Main runtime validator](../apps/editor/src/main/ipc/validateEngineInvocation.ts)
- [受信任 frame 与窗口级命令协调](../apps/editor/src/main/ipc/registerEngineIpc.ts)
- [隔离的 Editor BrowserWindow](../apps/editor/src/main/createEditorWindow.ts)
- [C++ JSONL client](../apps/editor/src/main/backend/backendClient.ts)

### C++

- [领域模型与 draft](../engine/include/vnengine/project.hpp)
- [原子场景替换](../engine/src/core/project.cpp)
- [项目聚合校验](../engine/src/core/project_validation.cpp)
- [JSONL exact parser/dispatch](../engine/src/backend/backend.cpp)

### 页面样式与 Runtime

- [共享页面样式合同](../packages/runtime/src/pageStyle.ts)
- [Runtime Project DTO](../packages/runtime/src/projectTypes.ts)
- [共享 UI 主题映射](../packages/player-ui/src/pageTheme.ts)
- [标题页组件](../packages/player-ui/src/TitleScreen.tsx)
- [CG 画廊组件](../packages/player-ui/src/CgGallery.tsx)
- [Editor 正式页面预览](../apps/editor/src/renderer/features/game-preview/GamePreview.tsx)
- [主界面 Form 预览](../apps/editor/src/renderer/features/start-screen/StartScreenFormEditor.tsx)
- [CG 画廊 Form 预览](../apps/editor/src/renderer/features/cg-gallery/CgGalleryFormEditor.tsx)
- [Editor 页面/Code 样式](../apps/editor/src/renderer/styles/editor.css)
- [Player 页面样式](../apps/player/src/renderer/styles/player.css)
- [Author → Runtime compiler](../apps/editor/src/main/export/AuthorProjectCompiler.ts)
- [Player Runtime Reader](../apps/player/src/shared/runtimeBundleSchema.ts)

## 12. 测试与验证

关键测试职责：

| 测试 | 覆盖 |
| --- | --- |
| `sceneCodeProjection.test.ts` | 全节点 canonical 投影、嵌套 range、引用诊断 |
| `sceneCodeParser.test.ts` | 全语法 round-trip、identity、缺失/歧义引用、字符串/实体预算 |
| `codeEditorReadonly.test.tsx` | Story/Style Apply、single-flight、冲突、Tab/反向缩进、Enter 对齐、IME/焦点边界 |
| `editorCodeModeIntegration.test.tsx` | Form/Blockly/Code 切换、invalid 隔离、恢复、严格保存、项目打开 |
| `projectSavePreparation.test.ts` | Code flush 顺序、失败短路、off-screen 草稿阻止 |
| `validateEngineInvocation.test.ts` | Main exact DTO、重复 origin、null 背景缩放、CG body 和额外字段 |
| `preloadEngineApi.test.ts` | 合同 marker 和 `scene.content.replace` 转发 |
| `useEngineProject.test.tsx` | 成功快照应用与 stale Preload 拒写 |
| C++ Core/Backend tests | origin、marker、no-op、失败原子性、深层 CG、NUL/长度和协议 shape |

常用验证命令：

```sh
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
pnpm --dir apps/editor exec vitest run
cmake --build engine/build --parallel 4
ctest --test-dir engine/build --output-on-failure
git diff --check
```

当前完整验收结果为 Editor 99 个测试文件、825 项通过、1 项跳过；C++ 4/4 测试套件通过，
Editor TypeScript、ESLint 和 diff 检查通过。

## 13. 扩展 Code 语法的检查表

新增指令或字段时按以下顺序处理：

1. 明确它是否能完全降级为现有 Author DTO；
2. 同步 formatter、parser、diagnostic catalog 与 canonical round-trip 测试；
3. 更新 `SceneContentDraft`、Main runtime validator、Preload/API 与 C++ exact parser；
4. 在 C++ candidate 上实现并验证失败不变、no-op revision 不增；
5. 确认 Form、Blockly 和 Preview 能从成功快照重建同一语义；
6. 若进入 Runtime，更新 compiler、Runtime Reader、Player/Web 模板与版本兼容声明；
7. 若影响可恢复进度，更新 Snapshot schema、迁移与存储测试；
8. 更新本专题、对应源码 README 和 `docs/README.md`。

不要只在 Renderer 中添加一个文本命令，也不要用多条现有 IPC 模拟整段 Code Apply。
