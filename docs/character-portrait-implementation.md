# 人物立绘实现流程

> 实现状态：已完成。人物节点最初在项目文件格式 v5 引入；场景跳转加入后，
> 当前 Writer 已升级为 v6，详见
> [场景跳转实现](./scene-jump-implementation.md)。测试数量会随功能变化，当前
> 状态应以 `pnpm --dir apps/editor test` 的结果为准。

> 总体技术选型和面试问答见
> [技术栈与面试讲解指南](./technical-stack-interview-guide.md)。

## 技术栈与面试答法

| 部分 | 使用技术 | 作用 |
| --- | --- | --- |
| 领域模型 | C++20、`std::variant`、`std::optional` | 把人物作为强类型时间线节点，`null` 表示清除层 |
| 层级规则 | C++ Core、整数 layer 1–10 | C++ 校验范围，Renderer 只负责映射视觉 z-order |
| 文件格式 | nlohmann/json、严格 v5/v6 Reader/Writer | 保存 assetId、slot、layer，并拒绝非法引用 |
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
- 层级越高越靠前，但所有人物始终位于背景上方、对白框下方。
- 表单编辑器和 Blockly 操作同一份 C++ 权威时间线。
- 保存、重新打开以及旧项目迁移后结果一致。

## 核心思想

### 1. 资源、时间线指令和预览状态分离

`Asset` 只描述可复用文件：ID、媒体类型、相对路径和显示名称。它不保存位置或层级。

`CharacterNode` 是时间线指令，描述“从这里开始，第几层显示哪张图，位于左/中/右”。

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

- `assetId` 有值：设置或替换该层图片。
- `assetId` 为 `null`：清除该层。
- `slot` 为 `left | center | right`：决定画面位置。
- 后出现的同层节点覆盖前面的同层节点。

最终预览按 layer 从小到大渲染。无需在项目中保存 CSS `z-index`。

### 3. 混合时间线保持原子性

`Dialogue`、`BackgroundNode`、`CharacterNode` 都是 `SceneNode`。删除、单条拖动、多选拖动继续复用通用的 `timeline.*` 命令，避免分别维护三套顺序。

## 数据模型

### C++

```cpp
struct CharacterNode {
  std::string id;
  std::optional<std::string> asset_id;
  CharacterSlot slot = CharacterSlot::center;
  int layer = 1;
};

using SceneNode = std::variant<
    Dialogue,
    BackgroundNode,
    CharacterNode,
    SceneJumpNode>;
```

领域约束：

- layer 必须在 1–10。
- asset_id 非空时必须指向当前 ProjectAggregate 中已有的 image Asset。
- asset_id 不能是空字符串。
- ID 继续与 Project、Scene、对白、背景、视觉实例和 Asset 共用全局命名空间。
- 所有参数先验证，失败时不能改变 Project 或 revision。

### TypeScript 公共快照

```ts
type CharacterNode = {
  id: string;
  type: 'character';
  assetId: string | null;
  slot: 'left' | 'center' | 'right';
  layer: number;
};
```

公共快照只含 Asset ID 和显示所需字段，不含绝对路径或项目相对路径。

## 文件格式 v5（人物引入版本）与当前 v6

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

清除第 1 层：

```json
{
  "id": "character-clear-id",
  "type": "character",
  "assetId": null,
  "slot": "left",
  "layer": 1
}
```

兼容策略：

- 人物节点在 v5 首次加入。
- 当前 Reader 严格接受 v1–v6。
- v1/v2 只有对白节点。
- v3 支持必须绑定图片的背景节点。
- v4 支持 `assetId: null` 的背景节点。
- v5 支持人物节点。
- v6 支持场景跳转节点，当前 Writer 始终写 v6。
- Project/Scene `schemaVersion` 仍为 1；本次变化属于磁盘 envelope 的演进。

## C++ 命令

新增：

```text
character.add {
  sceneId,
  afterNodeId?,
  beforeNodeId?
}

character.update {
  sceneId,
  nodeId,
  assetId: string | null,
  slot: "left" | "center" | "right",
  layer: 1..10
}
```

`character.add` 总是创建 `{assetId:null, slot:center, layer:1}`，ID 由 C++ 生成。

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

### 阶段 4：表单编辑器

修改：

- `ScenePanel.tsx`
- `InspectorPanel.tsx`
- `FormEditor.tsx`
- `useFormEditor.ts`

左侧增加“+ 立绘”，右侧人物检查器提供图片、位置和层级。对白“+”继续位于右侧。

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
位置 [左/中/右]
层级 [1..10]
```

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
3. 左、中、右位置正确。
4. 多层人物按 layer 遮挡，高层在前。
5. 后续同层节点替换之前图片。
6. `assetId:null` 清除对应层，不影响其他层。
7. 删除或重排人物节点后，预览重新归约得到正确历史状态。
8. 人物始终位于背景上方、对白框下方。
9. 表单与 Blockly 修改同一 C++ 节点，没有本地第二份真相。
10. 混合多选拖动、Delete 和垃圾桶对对白/背景/人物都有效。
11. 保存重开后人物、位置、层级与时间线顺序不变。
12. v1–v5 项目仍能打开并在保存时升级到当前 v6。
13. 非图片、缺失资源、非法 slot/layer 失败且 Project/revision 不变。
14. 图片路径不进入 Renderer、Preload 公共返回或普通 Engine 调用。

## 完成定义

- C++ Debug/Release 构建通过。
- CTest 全绿。
- TypeScript typecheck 与 ESLint 通过。
- Vitest 单元和真实 C++ JSONL 集成测试全绿。
- Electron production package 通过。
- `git diff --check` 通过。
