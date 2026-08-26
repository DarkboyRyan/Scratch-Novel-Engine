# 逻辑 Blockly 实现

> 实现状态：已完成。当前作者项目格式为 v16，导出为 runtime v7；桌面与 Web Player
> 共用同一套严格逻辑模型、执行器和 `GameRuntimeSnapshot v2`。

## 1. 功能范围

剧情场景的 Toolbox 现在按“剧情 / 逻辑 / 变量 / 音乐 / 图片”分类。首版逻辑功能包含：

- “设置变量”：把布尔值、有限数字或字符串写入变量；
- “增减变量”：给数值变量加上一个有限数字；
- C 形“如果 / 则 / 否则”：比较变量或字面量并只执行一个分支；
- C 形“重复”：把内部剧情固定执行 1–1000 次；
- 控制积木最多嵌套 16 层，可以在分支或循环体内继续放入普通剧情、变量和逻辑积木。

本版没有任意脚本、`eval`、源码字符串、无限循环、`and/or/not`、表达式函数调用或
条件选项副作用。这个范围让 C++ 作者模型、Editor、导出器和 Player 能对同一份数据做
完整的结构校验。

## 2. 作者数据模型

### 2.1 值与条件

逻辑值只允许 `boolean | number | string`。条件使用严格 AST，而不是可执行文本：

```ts
type LogicOperand =
  | { kind: 'variable'; name: string }
  | { kind: 'literal'; value: boolean | number | string };

type LogicCondition = {
  left: LogicOperand;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  right: LogicOperand;
};
```

变量名必须非空、不得包含 NUL，也不能以 ASCII 空白开头或结尾；长度上限按 UTF-8
编码后的字节数计算，为 64 bytes。字符串值同样拒绝 NUL，最多 4096 UTF-8 bytes；
数字必须有限。整个项目最多出现 32 个不同变量名，统计范围包含 Set、Change 和条件两侧
引用，而不是只统计已经赋值的变量。

### 2.2 扁平 paired markers

权威 `Scene.nodes` 仍是一条通用时间线。C 形积木保存为带稳定 ID 的扁平配对结构：

```text
logicIf(condition)
  ...Then nodes...
logicElse(ifNodeId)
  ...Else nodes...
logicEndIf(ifNodeId)

logicRepeat(count)
  ...body nodes...
logicEndRepeat(repeatNodeId)
```

可运行叶节点为：

```text
variableSet(variableName, value)
variableChange(variableName, amount)
```

`logicElse`、`logicEndIf` 和 `logicEndRepeat` 是隐藏 marker。它们让原有通用时间线、
序列化和资源引用模型继续保持扁平，同时由稳定 owner ID 保证配对，不暴露给作者直接编辑。
每个 If 总会原子创建 Else，即使两个分支暂时为空。

## 3. 权威不变量与原子编辑

C++ Core 是作者数据的真相来源。新增 If 会一次创建 root、Else、EndIf；新增 Repeat
会一次创建 root 和 EndRepeat。Editor 不会先在 Blockly 内乐观落库，而是发送命令，等待
C++ 返回完整项目快照后重新投影。

专用命令如下：

```text
variableSet.add / variableSet.update
variableChange.add / variableChange.update
logicIf.add / logicIf.update
logicRepeat.add / logicRepeat.update
logicControl.delete / logicControl.reorder
```

新增命令的定位字段直接展开为 `afterNodeId?` / `beforeNodeId?`。控制结构的删除遵循
Blockly C 形积木语义：root、配对 markers、Then/Else 或循环体以及其中嵌套的完整内容
一起删除；不会把内部剧情静默拼接成无条件执行。单个控制块的整体重排只允许通过控制
专用命令完成。通用 timeline delete、单块 reorder 或只包含部分控制范围的批量 reorder
都会拒绝控制 root/marker；`timeline.reorderMany` 只有在移动集合包含完整、配对且平衡的
控制范围时才会放行，以便“延伸”页能够携带页内完整 If/Repeat 原子换页，而不会制造孤儿结构。

结构校验还保证：

- Else 恰好出现一次，结束 marker 的 owner ID 必须与 root 相同；
- 控制结构正确嵌套且深度不超过 16；
- “延伸”只能位于控制栈为空的位置，逻辑结构不能跨越 Blockly 手动分页边界；
- 所有 add/update/delete/reorder 都先修改候选副本并做完整校验，失败时项目和 revision 不变；
- 第 33 个项目变量返回稳定业务错误 `logic_variable_limit`，不会伪装成内部错误。

## 4. Blockly 与表单编辑

Blockly 把扁平 markers 投影成作者看到的 C 形 If/Else 和 Repeat。拖入、字段修改、整块
移动或删除都会调用上述专用命令；重新打开项目时，再由 marker 结构无损重建嵌套积木。

Toolbox 分类如下：

| 分类 | 主要积木 |
| --- | --- |
| 剧情 | 对白、选项、延伸、场景跳转 |
| 逻辑 | If/Else、Repeat |
| 变量 | Set、Change |
| 音乐 | BGM |
| 图片 | 背景、立绘、清除立绘、视频 |

表单编辑不会把隐藏 markers 显示成普通节点。它使用缩进树展示 If 的 Then/Else 和
Repeat body，也会显示变量操作的当前摘要；条件、变量值和循环次数是只读的，作者需回到
图形化编辑修改。这避免表单和 Blockly 各自维护一套嵌套变更规则。

表单的静态画面预览没有一份可假定的运行时变量状态。播放头到达第一个 If 或 Repeat 后，
它会冻结在最后一个确定已执行的节点并标记“逻辑结果不确定”，不会把 Then、Else 或多次
循环的画面错误叠加。正式游戏预览使用真实 Runtime，因此会正常求值并展示实际分支结果。

## 5. Runtime 语义与防卡死

共享 TypeScript Runtime 在进入场景时预计算 marker 配对和跳转位置，然后用显式执行栈
解释逻辑，不使用 `eval`：

- 读取未定义变量得到数字 `0`；
- Change 未定义变量时从 `0` 开始；若现有值不是数字则进入 `runtimeError`；
- `eq` / `neq` 按类型和值严格比较；
- `gt` / `gte` / `lt` / `lte` 只接受两侧都是数字，否则进入 `runtimeError`；
- Repeat 只接受 1–1000 的固定整数，并在 loop stack 中记录剩余次数；
- 每次推进在遇到下一条对白、视频、选项或结束前，最多自动执行 10000 个步骤；超过预算
  会以 `logicStepLimit` 停止，防止跳转与嵌套控制组合导致界面卡死。

同一个 `@vnengine/runtime` reducer 同时服务 Editor 正式预览、Electron Player 和 Web
Player，所以三处的条件、循环和错误语义一致。

## 6. 保存、读取与版本兼容

作者 Writer 当前固定写 `fileVersion: 16`。Reader 接受 v1–v16：v1–v15 按既有规则
迁移为当前模型，但这些旧版本若伪造 v16 才有的逻辑节点会被拒绝；v16 首次保存变量、
条件和 paired markers。

Editor Main 严格把已保存 author v16 编译为 runtime v7。Player Reader 支持 runtime
v1–v7；逻辑节点只允许出现在 v7。当前 bundle manifest 声明
`playerCompatibility: ">=7 <8"`，桌面和 Web Player 模板声明
`runtimeCompatibility: ">=1 <8"`，两者分别表示“本包需要哪个 Player”与“本模板能读取
哪些包”，不可互换。

游戏进度使用 `GameRuntimeSnapshot v2`。相较 v1，它额外保存背景、立绘、变量表和活动
Repeat 栈，恢复时会重新校验当前项目的控制结构、变量声明、循环 owner 与剩余次数。
snapshot v1 只为无逻辑的旧存档保留兼容；它没有变量和循环状态，因此当前 Scene 游标
之前一旦包含逻辑节点就会被拒绝，其余旧进度仍按既有严格规则恢复。桌面存档和
IndexedDB Web 存档都复用这套严格解析与恢复。

## 7. 全栈技术链

| 层 | 技术与职责 |
| --- | --- |
| C++ Core | C++20、`std::variant`、候选副本事务；保存权威节点并校验 marker、嵌套、变量预算 |
| C++ Backend | nlohmann/json、JSONL；author v16 strict Reader/Writer、exact params、业务错误码 |
| Electron 边界 | typed shared protocol、Main IPC validator、contextBridge preload；逐层 exact-field 校验 |
| Renderer | React 19、Blockly 13、TypeScript；分类 Toolbox、C 形投影、后端优先 actions、表单只读树 |
| 导出 | Editor Main TypeScript strict compiler；author v16 → runtime v7，保留运行节点并剥离延伸 |
| Runtime | 纯 TypeScript reducer、预编译控制流、变量表、显式 loop stack、10000 步预算 |
| Player/存档 | Electron 与 Web 共用 runtime schema；`GameRuntimeSnapshot v2`、桌面原子文件与 IndexedDB |

主要实现位置：

- [C++ 领域模型](../engine/include/vnengine/model.hpp)
- [C++ 逻辑命令](../engine/src/core/project.cpp)
- [C++ 项目校验](../engine/src/core/project_validation.cpp)
- [C++ Backend 协议](../engine/src/backend/backend.cpp)
- [Author → Runtime 编译器](../apps/editor/src/main/export/AuthorProjectCompiler.ts)
- [Blockly 逻辑投影](../apps/editor/src/renderer/features/block-editor/logicStructure.ts)
- [共享逻辑校验](../packages/runtime/src/logicValidation.ts)
- [共享 Runtime](../packages/runtime/src/gameRuntime.ts)
- [存档快照](../packages/runtime/src/gameRuntimeSnapshot.ts)
- [Player Runtime Reader](../apps/player/src/shared/runtimeBundleSchema.ts)

## 8. 测试与验收

自动化测试覆盖：

- C++ 保存重开、v1–v15 迁移、旧版本逻辑拒绝、marker 配对和嵌套边界；
- 原子新增、更新、整棵删除与整体移动，以及通用 timeline 命令不能拆散控制结构；
- NUL、UTF-8 多字节边界、NaN/Infinity、Repeat/嵌套/32 变量上限和 extra fields；
- Blockly 投影、事件路由、分类 Toolbox、表单树和不确定静态预览；
- Runtime 条件语义、循环、自动步骤预算、snapshot v2 round-trip 与旧 v1 兼容；
- author v16 → runtime v7 导出，以及桌面/Web Player v1–v7 Reader 和模板契约。

本次实现验收使用 CTest、Editor TypeScript typecheck/ESLint/Vitest、Runtime Vitest、
Player Vitest 与 Player release-tools Node tests；逻辑链相关改动通过完整测试套件。
