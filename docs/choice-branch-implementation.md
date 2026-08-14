# 选项分支实现技术栈

> 本文记录“显示选择”与内部“选项”积木从 C++ 数据模型、Blockly 编辑、
> Electron 协议到正式游戏预览的完整实现。总体架构见
> [当前架构](./architecture.md)，预览 reducer 见
> [游戏顺序预览](./game-preview-runtime.md)。

## 1. 功能语义

选项分支由两层结构组成：

- `ChoiceNode` 是 `Scene.nodes` 中的顶层时间线节点，对应 Blockly 的“显示选择”
  容器积木；
- `ChoiceOption` 是容器内部的子项，保存选项文字和目标 Scene ID，不是独立的
  `SceneNode`；
- 一个刚创建的 `ChoiceNode` 必须允许 `options` 为空。它在编辑器中是合法的空白
  占位符，正式预览执行到这里时直接继续；
- 只要存在一个或更多选项，预览就进入阻塞式 `choosing` 状态，只有玩家点击某个
  选项后才会跳转；
- 选项只能跳到明确保存的稳定 Scene ID，不根据场景数组下标推算目标。

因此“显示选择”同时承担两个职责：外层节点决定它在剧情时间线中的位置，内部
选项决定玩家可以看到哪些分支以及各自跳到哪里。

## 2. 技术栈

| 层 | 技术 | 用途 |
| --- | --- | --- |
| 领域模型 | C++20、`std::variant`、`std::vector` | 保存 ChoiceNode、稳定 Option ID 和引用约束 |
| 文件格式 | nlohmann/json、版本化 Reader/Writer | v9 严格读写嵌套 `options` |
| 本地协议 | JSONL、Electron IPC、contextBridge | 传递具名 choice 命令，不暴露 C++ 或 Node 权限 |
| 图形编辑 | Blockly 13、自定义 Block/Connection/Event | 外层容器、内部选项、字段编辑和嵌套重排 |
| 状态协调 | React 19、TypeScript 5.9、Promise 队列 | 应用 C++ 完整快照并提交活动字段草稿 |
| 正式预览 | TypeScript 纯状态机、React、HTML/CSS | `choosing` 停顿、按钮渲染和分支跳转 |
| 测试 | CTest、Vitest、真实 JSONL Backend | Core、序列化、IPC、Blockly、reducer 和 UI 回归 |

这里不需要新增远程服务或 HTTP API。Renderer 到 Main 仍使用 Electron IPC，Main
到本地 C++ 子进程仍使用 JSONL。

## 3. 权威数据模型

### 3.1 C++

```cpp
struct ChoiceOption {
  std::string id;
  std::string text;
  std::string target_scene_id;
};

struct ChoiceNode {
  std::string id;
  std::vector<ChoiceOption> options;
};

using SceneNode = std::variant<
    Dialogue,
    BackgroundNode,
    CharacterNode,
    SceneJumpNode,
    BgmNode,
    VideoNode,
    ChoiceNode>;
```

`ChoiceOption.id` 由 C++ 生成并在修改、重排、保存和重开后保持不变。不能把数组
下标当 ID，否则移动选项会让 Blockly block ID、React key 和更新目标全部漂移。

### 3.2 Renderer DTO

```ts
type ChoiceOption = {
  id: string;
  text: string;
  targetSceneId: string;
};

type ChoiceNode = {
  id: string;
  type: 'choice';
  options: ChoiceOption[];
};
```

TypeScript 只描述 C++ 返回的跨进程形状。Renderer 不生成持久化 ID，也不直接
向 `Scene.nodes` 或 `ChoiceNode.options` 写入对象。

### 3.3 领域不变量

C++ Core 在提交前保证：

- ChoiceNode ID、ChoiceOption ID、Scene ID、其他 Node ID 和 Asset ID 全局唯一；
- 选项文案去掉 ASCII 首尾空白后必须非空，持久化文本不能带首尾空白；
- `targetSceneId` 必须引用现有场景，也允许跳回包含该选项的当前场景；
- 被其他场景选项引用的场景不能删除，返回 `scene_in_use`；
- 失败操作不提交候选数据，合法 no-op 不增加 revision；
- 空 `options` 是合法状态，不会被错误地当成损坏项目。

## 4. 项目文件 v9

当前 Writer 固定写 `fileVersion: 9`，Reader 接受 v1–v9。v9 首次加入
`type: "choice"`：

```json
{
  "id": "choice-1",
  "type": "choice",
  "options": [
    {
      "id": "option-1",
      "text": "调查教室",
      "targetSceneId": "scene-classroom"
    },
    {
      "id": "option-2",
      "text": "前往天台",
      "targetSceneId": "scene-rooftop"
    }
  ]
}
```

v9 Reader 对 ChoiceNode 使用严格字段集合：节点只能有 `id/type/options`，每个
选项只能有 `id/text/targetSceneId`，并要求 `options` 是数组。解析成功后还要经过
Core 的全项目引用与唯一性校验。v1–v8 仍按各自旧格式读取，但不能伪装包含尚未
存在于对应版本的 ChoiceNode。

## 5. 命令合同

| Method | 关键参数 | 作用 |
| --- | --- | --- |
| `choice.add` | `sceneId`、可选 `afterNodeId/beforeNodeId` | 在混合时间线创建空 ChoiceNode，返回 `nodeId` |
| `choice.option.add` | `sceneId/nodeId/text/targetSceneId`、可选 `beforeOptionId` | 新建内部选项，返回稳定 `optionId` |
| `choice.option.update` | `sceneId/nodeId/optionId/text/targetSceneId` | 原子修改文案与目标场景 |
| `choice.option.delete` | `sceneId/nodeId/optionId` | 删除一个内部选项 |
| `choice.option.reorder` | `sceneId/nodeId/optionId/beforeOptionId` | 在所属 ChoiceNode 内重排；`null` 表示末尾 |
| `timeline.deleteMany` | ChoiceNode 的顶层 `nodeId` | 删除整个选择容器及其内部选项 |
| `timeline.reorder*` | ChoiceNode 的顶层 `nodeId` | 与其他剧情节点一起重排外层时间线 |

`choice.add` 不接受 options payload，始终只创建空容器；子项必须通过独立命令创建。
这样 C++ 可以分别校验顶层时间线锚点和内部选项锚点，也能让每次变更获得清晰的
错误码与 revision 语义。

一次字段修改的调用链是：

```text
Blockly FieldTextInput / FieldDropdown
  → choiceBlockEvents 提取 nodeId、optionId、text、targetSceneId
  → useEngineProject 串行发送 typed action
  → preload contextBridge
  → Main 校验 IPC method 与参数形状
  → BackendClient 发送 JSONL
  → C++ Backend 解码命令
  → C++ Core 校验并提交
  → 返回完整 Project 快照
  → React 更新 props
  → Blockly 按稳定 ID 重新投影
```

## 6. Blockly 嵌套容器

图形编辑器注册两种不同连接级别的积木：

```text
显示选择（vn_choice）             ← 顶层前/后剧情连接
└── OPTIONS statement input
    ├── 选项 A（vn_choice_option） ← 只接受 VN_CHOICE_OPTION 连接
    ├── 选项 B（vn_choice_option）
    └── 选项 C（vn_choice_option）
```

核心设计如下：

1. `vn_choice` 可以像对白、背景或跳转一样插入、删除和重排。
2. `OPTIONS` 与选项子链都使用专用 `VN_CHOICE_OPTION` connection check，
   防止普通剧情积木进入容器。Blockly 的顶层连接可能不设 check，
   因此还有第二道保护：新选项若落在空白画布、顶层剧情链或临时容器，
   事件层会立即重投 C++ 权威快照，清除临时积木并修复可能被拆开的剧情链。
3. 选项积木包含 `FieldTextInput` 和动态 `FieldDropdown`；场景列表变化后下拉框
   继续保存稳定 Scene ID，界面标签才显示“场景几 · 名称”。
4. 从 Toolbox 拖入的临时 option 只有真正接到某个 ChoiceNode 后才发送
   `choice.option.add`。C++ 返回 `optionId` 后，临时 block 会被正式快照投影替换。
5. 已保存 option 只能在原所属 ChoiceNode 内重排；拖到外层或另一个容器不会静默
   改变所有权，而是恢复权威投影。
6. 保存、切换场景、切换编辑模式或开始预览前，会采集仍在编辑中的选项字段并
   逐个提交；任何失败都会阻止后续动作。

表单编辑器不提供创建或编辑选项的入口，但会只读展示已有 ChoiceNode 及其目标，
仍允许在统一时间线中选择、移动或删除整个节点。选项作者态只在图形化编辑中维护。

## 7. 正式预览状态机

### 7.1 `choosing` 是明确的阻塞状态

```ts
type GamePreviewRuntime = {
  status:
    | 'playing'
    | 'playingVideo'
    | 'choosing'
    | 'finished'
    | 'runtimeError';
  sceneId: string;
  nextNodeIndex: number;
  choices: ChoiceOption[];
  // background、characters、BGM、dialogue、video 等其余运行字段
};
```

reducer 扫描到 ChoiceNode 时：

- `options.length === 0`：继续扫描下一条节点，不显示空选项层；
- 有选项：把 `nextNodeIndex` 先移到 ChoiceNode 之后，返回 `choosing`，并保存当前
  只读选项列表；
- `choosing` 期间舞台点击、Space 和 Enter 都不能普通推进，只能点击某个选项；
- 选择时按稳定 `optionId` 重新定位当前 ChoiceNode 和 Option，不信任 UI 直接传入
  一个目标 Scene ID；
- Option 或目标场景在运行快照中不存在时进入 `runtimeError`，不会卡死或跳到猜测位置。

`nextNodeIndex - 1` 必须仍是当前 ChoiceNode，确保选择属于真正阻塞预览的节点，
而不是 UI 中的过期选项。

### 7.2 与场景跳转一致的视觉语义

玩家选择后使用和 `SceneJumpNode` 一致的场景边界：

- `sceneId` 切换为 `targetSceneId`；
- `nextNodeIndex` 从目标场景 0 开始；
- 背景先恢复成目标场景的 `backgroundAssetId`；
- 清空上一场景人物立绘，随后按目标场景时间线重新建立人物层；
- BGM 是跨场景持续状态，保持当前曲目和播放位置，直到目标剧情遇到新的 BGM
  节点；
- 进入目标后立即继续归约背景、人物、BGM、空视频或空选择等自动节点，最后停在
  对白、视频、下一个非空选择、结束或运行错误。

对白语音不会在选择界面继续播放。ChoiceNode 本身不引用媒体，不新增文件路径或
capability 权限。

## 8. 选项界面布局

选项层覆盖 `VisualStage`，但每条按钮始终是固定矩形：

- 列表宽度为 `min(560px, 100% - 72px)`；
- 每个选项条固定 `54px` 高，`flex: 0 0 54px`，不会因为数量变化而压扁或拉高；
- 相邻选项使用 `12px` 间距；
- 外层使用 `place-items: center`，列表整体始终垂直、水平居中；
- 增加选项时，变化的是列表总高度和每条选项相对舞台中心的纵坐标。少量选项围绕
  中心展开，而不是让按钮自身变大；
- 列表最大高度是舞台高度减 `96px`。选项过多时内部启用 `overflow-y: auto`，舞台、
  退出按钮和每个 54px 选项条都保持稳定。

按钮用真实 `<button>` 渲染，提供 `role="group"`、可见焦点样式和省略号处理长文案。
React 默认转义文本，选项文字不会被当作 HTML 执行。

## 9. 安全与一致性

这项功能不扩大 Renderer 权限：

- Renderer 只能调用 preload 暴露的具名 choice API，看不到 `ipcRenderer`、文件系统
  或 C++ 子进程；
- Main 对 method 和参数形状进行运行时白名单校验，TypeScript 类型不是安全边界；
- Backend 对 JSON exact fields、字符串/null 和 placement 参数再次校验；
- C++ Core 是最终规则来源，验证文案、ID、所属 ChoiceNode、内部锚点和目标 Scene；
- UI 只发送 `optionId`，运行时根据权威 Project 快照解析目标，避免 DOM 被篡改后
  任意构造跳转；
- 项目保存仍采用原子 manifest 替换，ChoiceNode 只是 JSON 数据，不改变媒体发布
  或路径隔离模型。

## 10. 测试策略

| 范围 | 重点用例 |
| --- | --- |
| C++ Core | 空 Choice 合法、稳定 ID、增改删排、文本 trim、目标存在、scene_in_use、no-op |
| C++ 序列化 | v9 round-trip、空/多选项、严格字段、旧版本拒绝 Choice、损坏引用拒绝 |
| JSONL Backend | 五个 choice method、返回 nodeId/optionId、错误码和 revision |
| IPC/Preload | API 参数逐字段验证、Renderer 不能传多余字段或伪造 ID |
| Blockly | 专用 connection check、动态场景下拉、嵌套新增/修改/重排/删除与重新投影 |
| 表单兼容 | 只读显示已有选项且没有“+ 选项”入口 |
| Preview reducer | 空选项跳过、`choosing` 阻塞、按 ID 分支、背景/人物/BGM 语义、坏目标错误 |
| React/CSS | 固定 54px 按钮、按选项数渲染、点击只选择一次、舞台点击不穿透、超量滚动 |

## 11. 关键文件

```text
engine/include/vnengine/model.hpp
engine/include/vnengine/project.hpp
engine/src/core/project.cpp
engine/src/backend/backend.cpp
engine/src/backend/serialization.cpp

apps/editor/src/shared/projectTypes.ts
apps/editor/src/shared/engineProtocol.ts
apps/editor/src/renderer/features/block-editor/blocks/choiceBlock.ts
apps/editor/src/renderer/features/block-editor/choiceBlockEvents.ts
apps/editor/src/renderer/features/block-editor/projectSceneToWorkspace.ts
apps/editor/src/renderer/features/block-editor/BlocklyWorkspace.tsx
apps/editor/src/renderer/features/game-preview/previewRuntime.ts
apps/editor/src/renderer/features/game-preview/useGamePreview.ts
apps/editor/src/renderer/features/game-preview/GamePreview.tsx
apps/editor/src/renderer/styles/editor.css
```

## 12. 面试回答模板

> 选项功能不是在 React 里临时拼一个跳转，而是增加了 C++ 权威 ChoiceNode。
> ChoiceNode 是七种 SceneNode 之一，内部 ChoiceOption 使用稳定 ID、文案和目标
> Scene ID。Blockly 用 statement input 做嵌套容器，并用专用 connection type
> 防止选项变成独立剧情节点；每次编辑转换成细粒度 choice 命令，由 C++ 校验后
> 返回完整快照。项目文件升级为 v9。正式预览的纯状态机增加 choosing 阻塞态，
> 空容器跳过，有选项时渲染固定 54px 的居中矩形按钮，点击后按权威 optionId
> 跳转；目标场景重置背景和人物但延续 BGM。这样作者态、持久化和运行态使用同一
> 语义，而且 UI 不能绕过 C++ 引用校验。

## 13. 当前边界

- 当前选择是“点击后直接跳到目标场景”，尚无变量赋值、条件表达式和选项可见性；
- 尚无键盘上下选择、历史返回、限时选项、已选标记和存档；
- 正式预览状态机仍在 TypeScript。独立 Player 的 MVP 应复用抽离后的共享
  TypeScript Runtime；只有在变量、脚本、跨版本存档或确定性回放变得复杂后，
  才评估把同一 Choice 运行语义下沉到 C++ Runtime。
