<!-- 文件职责：记录人物立绘全链路；关键内容：资源、节点、层级坐标、Blockly 与预览。 -->

# 人物立绘实现流程

> 实现状态：已完成。人物节点最初在项目文件格式 v5 引入；场景跳转曾将 Writer
> 升级为 v6，音频升级为 v7，视频升级为 v8，选项分支升级为 v9；主界面媒体配置
> 在 v10 加入、独立标题在 v11 加入；v17 加入显示 CG，v18 加入人物立绘侧挂特效，
> v19 增加人物 `mode` 并区分待选图占位与明确清除；v20 再加入标题页 eyebrow；v21 为
> 场景初始背景、时间线背景和人物立绘加入缩放。当前 Writer 为 v22、Reader 支持 v1–v22。
> 显示 CG 的完整历史里程碑是 Author v17 / Runtime v8 / Snapshot v3；人物特效首次在
> Author v18 / Runtime v9 / Snapshot v4 引入；当前 Runtime/Snapshot 分别为 v13/v5。
> 详见 [视频播放积木](./video-playback-block.md)。测试数量会随功能变化，当前
> 状态应以 `pnpm --dir apps/editor test` 的结果为准。

> 七类人物动画、右侧 value socket、原子移动、Runtime v9 引入/当前 Runtime v13、Snapshot v4 历史里程碑与暂停/
> reduced-motion 语义见 [人物立绘特效](./character-portrait-effects.md)。

> 总体技术选型和面试问答见
> [技术栈与面试讲解指南](./technical-stack-interview-guide.md)。

## 技术栈与面试答法

| 部分 | 使用技术 | 作用 |
| --- | --- | --- |
| 领域模型 | C++20、`std::variant`、`std::optional` | 把人物作为强类型时间线节点，`mode` 区分显示与清除 |
| 层级规则 | C++ Core、整数 layer 1–10 | C++ 校验范围，Renderer 只负责映射视觉 z-order |
| 文件格式 | nlohmann/json、版本化严格 Reader/Writer | 人物在 v5 引入；v13 增加坐标，v18 增加 effect，v19 增加 mode，v21 增加缩放 |
| 跨进程 DTO | TypeScript discriminated union | 用 `node.type === 'character'` 做安全缩窄 |
| UI | React 19 受控表单、HTML/CSS | 人物检查器、左中右位置和分层渲染 |
| 图形化编辑 | Blockly 13 自定义 Block/Field | 人物积木、图片资源槽、拖动和时间线重排 |
| 预览 | TypeScript 纯 reducer、`Map<number, State>` | 按时间线归约每一人物层，不复制 Project |
| 测试 | CTest、Vitest | 校验模型、协议、积木事件和预览层级 |

面试时重点说明三层分离：**Asset 是文件，CharacterNode 是“从此处修改某层”
的指令，PreviewState 是扫描时间线得到的临时结果。** 所以同一图片可以复用，
编辑器也不会把 CSS `z-index` 当成业务数据保存。

## 目标

在现有“对白 + 背景切换”统一时间线中加入人物立绘节点，并完成以下闭环：

- 图片资源可以作为人物立绘使用，不复制文件、不把路径暴露给 Renderer。
- 新人物节点默认无图片、居中、第 1 层。
- 人物节点从出现位置开始持续生效，直到后面的节点修改或清除同一层。
- 支持左、中、右位置与 1–10 人物层级。
- 场景初始背景、时间线背景和人物立绘支持 10%–300% 的整数缩放，默认 100%。
- 层级越高越靠前，但所有人物始终位于背景上方、对白框下方。
- 表单编辑器和 Blockly 操作同一份 C++ 权威时间线。
- 保存、重新打开以及旧项目迁移后结果一致。

## 核心思想

### 1. 资源、时间线指令和预览状态分离

`Asset` 只描述可复用文件：ID、媒体类型、相对路径和显示名称。它不保存位置或层级。

`CharacterNode` 是时间线指令，描述“从这里开始，第几层显示哪张图，以及使用左/中/右预设或自定义坐标”。

预览状态不是第二份项目数据，而是把 Scene 从开头归约到当前播放位置得到的临时结果。

```text
C++ ProjectAggregate（唯一业务真相）
  → Scene.nodes（对白/背景/人物统一顺序）
  → Renderer 纯函数归约
  → 当前背景 + 当前人物层 + 当前对白
  → PreviewPanel
```

### 2. 人物层以 layer 为身份

首版提供 1–10 层。人物节点的 `layer` 表示它修改哪一层：

- `mode: 'show'` 且 `assetId` 有值：设置或替换该层图片。
- `mode: 'show'` 且 `assetId` 为 `null`：尚未选图的 Author 占位；编辑预览按 no-op
  处理，导出会拒绝，不会误清人物层。
- `mode: 'clear'`：明确清除该层，并要求 `assetId`、`position`、`effect` 全为 `null`。
- `scalePercent` 为 10–300 的整数；新节点默认 100，`mode: 'clear'` 必须为 100。
- `slot` 为 `left | center | right`：决定画面位置。
- `position` 为 `null` 时使用 slot 预设；有值时保存画面百分比坐标，原点为左上角。
- 后出现的同层节点覆盖前面的同层节点。

最终预览按 layer 从小到大渲染。无需在项目中保存 CSS `z-index`。

### 3. 混合时间线保持原子性

`Dialogue`、`BackgroundNode`、`CharacterNode` 都是 `SceneNode`。删除、单条拖动、多选拖动继续复用通用的 `timeline.*` 命令，避免分别维护三套顺序。

## 数据模型

### C++

```cpp
struct CharacterNode {
  std::string id;
  CharacterNodeMode mode = CharacterNodeMode::show;
  std::optional<std::string> asset_id;
  CharacterSlot slot = CharacterSlot::center;
  int layer = 1;
  std::optional<CharacterPosition> position;
  std::optional<CharacterEffect> effect;
  int scale_percent = 100;
};

using SceneNode = std::variant<
    Dialogue,
    BackgroundNode,
    CharacterNode,
    SceneJumpNode>;
```

领域约束：

- layer 必须在 1–10。
- position 有值时，x/y 都必须是 0–100 的有限数字。
- `show` 的非空 asset_id 必须指向当前 ProjectAggregate 中已有的 image Asset；空值表示
  可继续编辑的待选图占位，此时 effect 必须为空。
- `clear` 必须同时令 asset_id、position 与 effect 为空。
- effect 必须是严格七类 tagged union，只能用于已选图的 `show` 节点。
- scale_percent 必须是 10–300 的整数；clear 节点必须为 100。
- asset_id 不能是空字符串。
- ID 继续与 Project、Scene、对白、背景、视觉实例和 Asset 共用全局命名空间。
- 所有参数先验证，失败时不能改变 Project 或 revision。

### TypeScript 公共快照

```ts
type CharacterNode =
  | {
      id: string;
      type: 'character';
      mode: 'clear';
      assetId: null;
      slot: 'left' | 'center' | 'right';
      layer: number;
      position: null;
      effect: null;
      scalePercent: 100;
    }
  | {
      id: string;
      type: 'character';
      mode: 'show';
      assetId: string | null;
      slot: 'left' | 'center' | 'right';
      layer: number;
      position: { x: number; y: number } | null;
      effect: CharacterEffect | null;
      scalePercent: number;
    };
```

公共快照只含 Asset ID 和显示所需字段，不含绝对路径或项目相对路径。

## 文件格式 v5（人物引入版本）、v19 mode 与当前 v22

v5 增加人物时间线节点：

```json
{
  "id": "character-node-id",
  "type": "character",
  "assetId": "alice-image-id",
  "slot": "left",
  "layer": 1
}
```

v19 起明确清除第 1 层；当前 v22 延续 v21 的规则，仍精确要求清除节点的缩放为 100：

```json
{
  "id": "character-clear-id",
  "type": "character",
  "mode": "clear",
  "assetId": null,
  "slot": "left",
  "layer": 1,
  "position": null,
  "effect": null,
  "scalePercent": 100
}
```

Author v18 在 v5 字段基础上精确加入 `position` 与 `effect`，无特效时写
`"effect": null`；v19 再精确加入 `mode`。`show + assetId:null` 是尚未选择图片的
Author 占位，预览会跳过，所有导出格式都会以稳定错误拒绝；它不会降级成 Runtime v13 的
清除指令。完整 effect union 示例见[人物立绘特效](./character-portrait-effects.md)。

Author v21 同时为 `Scene.backgroundScalePercent`、BackgroundNode 和 CharacterNode 加入
`scalePercent`。三者都是 10–300 的整数，默认 100；场景没有初始背景、背景节点清空背景，
或人物节点使用 `mode:'clear'` 时，缩放必须规范化为 100。标题页背景和 CG 不使用这些字段。

兼容策略：

- 人物节点在 v5 首次加入。
- 当前 Reader 严格接受 v1–v22。
- v1/v2 只有对白节点。
- v3 支持必须绑定图片的背景节点。
- v4 支持 `assetId: null` 的背景节点。
- v5 支持人物节点。
- v6 支持场景跳转；v7 增加语音/BGM；v8 增加 VideoNode；v9 增加 ChoiceNode；
  v10 增加项目级 `startScreen` 媒体，v11 增加独立标题，v12 增加手动延伸，v13 为人物节点增加可空 `position: {x,y}`，v14 增加扁平 CG 画廊，v15 把画廊升级为固定九槽页面，v16 增加变量和配对逻辑，v17 增加显示 CG 控制块，v18 增加人物 sidecar effect，v19 增加人物 `mode`，v20 增加标题页 eyebrow，v21 增加剧情图片缩放，v22 增加主界面和 CG 画廊严格样式；当前 Writer 始终写 v22。
- v1–v17 人物节点迁移为 `effect: null`；旧版本伪造 effect、或 v18 缺少 effect 都会被 exact-fields Reader 拒绝。
- v1–v18 人物根据旧 `assetId` 迁移：非空为 `show`、空值为 `clear`；旧 clear 遗留
  position 会规范化为 `null`。v19 缺少或伪造 `mode` 会被拒绝。
- v1–v20 场景、背景节点和人物节点统一迁移为 100%；v21 缺少、越界、非整数缩放，或在
  空背景/clear 节点保存非 100 缩放会被拒绝。
- Project/Scene `schemaVersion` 仍为 1；本次变化属于磁盘 envelope 的演进。

## C++ 命令

新增：

```text
character.add {
  sceneId,
  mode?: "show" | "clear",
  assetId?: string | null,
  afterNodeId?,
  beforeNodeId?
}

character.update {
  sceneId,
  nodeId,
  mode?: "show" | "clear",
  assetId: string | null,
  slot: "left" | "center" | "right",
  layer: 1..10,
  position: {x, y} | null,
  scalePercent: 10..300
}

characterEffect.update { sceneId, nodeId, effect: CharacterEffect | null }
characterEffect.move { sceneId, fromNodeId, toNodeId, effect: CharacterEffect }
```

`character.add` 省略 mode 时默认创建
`{mode:show, assetId:null, slot:center, layer:1, position:null, effect:null, scalePercent:100}` 待选图占位，
ID 由 C++ 生成；显式 `mode:clear` 才创建清除指令。`character.update` 省略 mode 时保留
现有模式，显式切换为 clear 时原子清空 assetId、position 和 effect。
跨人物拖动特效使用一次 `characterEffect.move`，任何失败都不改变 source、target 或 revision。

继续复用：

- `timeline.deleteMany`
- `timeline.reorder`
- `timeline.reorderMany`

## 实现阶段与文件

### 阶段 1：C++ 模型与持久化

修改：

- `engine/include/vnengine/model.hpp`
- `engine/include/vnengine/project.hpp`
- `engine/src/core/project.cpp`
- `engine/src/backend/serialization.hpp`
- `engine/src/backend/serialization.cpp`
- `engine/src/backend/backend.cpp`
- Core/Backend tests

完成 CharacterNode、领域操作、v5 严格读写、v1–v4 迁移以及事务性错误测试。

### 阶段 2：跨进程协议

修改：

- `apps/editor/src/shared/projectTypes.ts`
- `apps/editor/src/shared/engineProtocol.ts`
- `apps/editor/src/main/ipc/validateEngineInvocation.ts`
- `apps/editor/src/main/backend/backendResponse.ts`
- `apps/editor/src/preload.ts`
- `apps/editor/src/renderer/hooks/useEngineProject.ts`

每层都使用判别联合并严格验证字段，未知字段不穿过 Main→Renderer 信任边界。

### 阶段 3：预览归约与渲染

修改：

- `timelinePreview.ts`
- `PreviewPanel.tsx`
- `App.tsx`
- `editor.css`

归约器扫描到当前播放位置，维护：

```text
backgroundAssetId
backgroundScalePercent
charactersByLayer
speaker/text/showDialogue
```

PreviewPanel 的固定视觉顺序：

```text
背景 z=0
人物 z=10+layer
对白 z=30
编辑 UI z=40+
```

表单预览只展示动画结束后的静态 opacity；Editor 正式预览与 Player 使用共享
`VisualStage` 播放 effect，并让背景围绕中心、人物围绕底部中心锚点缩放。动画暂停、
reduced-motion 和 Snapshot v4 人物特效历史语义见特效专文；当前 Snapshot v5 还保存缩放。

### 阶段 4：表单编辑器

修改：

- `ScenePanel.tsx`
- `InspectorPanel.tsx`
- `FormEditor.tsx`
- `useFormEditor.ts`

左侧增加“+ 立绘”，右侧人物检查器提供图片、位置、层级和 10%–300% 缩放。场景初始
背景的资源面板和时间线背景检查器提供相同缩放范围；对白“+”继续位于右侧。

### 阶段 5：Blockly

新增 `blocks/characterBlock.ts`，并修改：

- `toolbox.ts`
- `projectSceneToWorkspace.ts`
- `BlocklyWorkspace.tsx`
- `dialogueBlockEvents.ts`
- `blockSelection.ts`
- `blockGroupDrag.ts`
- `blockEditorLayout.ts`
- `EngineTrashcan.ts`

积木结构：

```text
人物立绘 [白色图片名称槽]
位置 [左/中/右/自定义]
层级 [1..10]
缩放 [10..300]
```

具体 X/Y 只在表单编辑中显示；Blockly 不显示数值，只在存在自定义坐标时把位置显示为“自定义”。
人物积木右侧的 typed value socket 接受独立“特效”分类中的七类 value block；表单只读显示
摘要，避免出现第二套特效编辑真相。

资源条图片拖到人物积木后调用 `character.update`。混合选择、顺序、Delete 和垃圾桶继续使用通用 timeline 命令。

## 失败与并发边界

- 表单/Blockly 的当前草稿必须先提交，才能新增、切换或修改人物节点。
- 保存、打开、图片导入期间禁止新的画布结构操作。
- C++ 返回失败时 React 不本地修改权威快照。
- 图片缺失只显示占位，不自动删除 Asset 或人物节点。
- 非图片 Asset、缺失 Asset、非法层级、非法位置必须在 C++ 和 Main 两层拒绝。

## 验收矩阵

1. 新人物节点默认无图片、居中、第 1 层。
2. 拖入图片后，表单、积木和预览显示同一名称/图片。
3. 左、中、右预设正确；表单坐标保存后预览按百分比定位，Blockly 只显示“自定义”。
4. 多层人物按 layer 遮挡，高层在前。
5. 后续同层节点替换之前图片。
6. 只有 `mode:clear` 清除对应层；`mode:show + assetId:null` 保持占位且不影响画面。
7. 删除或重排人物节点后，预览重新归约得到正确历史状态。
8. 人物始终位于背景上方、对白框下方。
9. 表单与 Blockly 修改同一 C++ 节点，没有本地第二份真相。
10. 混合多选拖动、Delete 和垃圾桶对对白/背景/人物都有效。
11. 保存重开后人物、位置、层级、缩放与时间线顺序不变。
12. v1–v21 项目仍能打开并在保存时升级到当前 v22；v1–v12 的旧人物节点自动补 `position: null`，v13 及之后的坐标保持不变，v1–v17 人物统一补 `effect: null`，并按旧 assetId 推导 mode；所有旧剧情图片缩放补 100%。
13. 非图片、缺失资源、非法 slot/layer 失败且 Project/revision 不变。
14. 图片路径不进入 Renderer、Preload 公共返回或普通 Engine 调用。
15. 七类特效严格读写；普通人物更新保留特效，清图同步清特效，跨人物移动保持原子性。
16. 正式预览/Player 播放动画；暂停保留动画进度，reduced-motion 与表单预览使用最终静态状态。
17. 未选图 show 占位在预览中是 no-op，导出明确失败；clear 的三个可空字段必须全为 null。
18. 10% 和 300% 边界可保存、预览、导出和读档；非法或小数缩放被拒绝，无背景和 clear
    始终回到 100%；标题页背景与 CG 不出现缩放字段或控件。

## 完成定义

- C++ Debug/Release 构建通过。
- CTest 全绿。
- TypeScript typecheck 与 ESLint 通过。
- Vitest 单元和真实 C++ JSONL 集成测试全绿。
- Electron production package 通过。
- `git diff --check` 通过。
