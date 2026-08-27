<!-- 文件职责：记录显示 CG 积木实现；关键内容：paired range、计时、暂停、运行时和存档。 -->

# 显示 CG Blockly 实现

> 实现状态：已完成。当前作者项目格式为 v20，导出为 runtime v10；桌面 Player、
> Web Player 与 Editor 正式预览共用同一套 CG 显示、对白和计时语义。显示 CG 首次
> 引入的历史里程碑仍是 Author v17 / Runtime v8 / Snapshot v3。

## 1. 用户看到的行为

“显示 CG”位于 Blockly 的“图片 / Images”分类，是一个真正的 C 形剧情积木：

- 从下拉框选择一张图片资源；
- “对白前时长”以秒显示，可输入 `0`–`60`，精度为 0.001 秒；
- 开口内只能放置零条或多条对白；
- 运行到积木时先显示完整 CG，图片实际载入后才开始倒计时；
- 倒计时结束后显示第一句内部对白，CG 在全部内部对白期间保持可见；
- 离开积木后清除 CG，恢复下层的背景和立绘画面。

CG 使用黑色底和 `object-fit: contain`，因此不会为了铺满窗口而裁掉图片。对白层位于
CG 上方，暂停菜单、选项、存读档和选择层仍位于对白上方。CG 整块可以放进 If 的
Then/Else 或 Repeat body，但它自己的开口只接受对白，不能再嵌套逻辑、视频、选项、
场景跳转、延伸或另一块 CG。

表单编辑会以只读缩进树展示 CG 和内部对白，并提示到图形化编辑修改。表单的静态画面
预览无法假定播放时刻，因此到达第一个 CG 控制块后会冻结并提示使用正式运行预览；它
不会把 CG 后的画面错误地当作已经执行。

## 2. 作者数据模型

Blockly 的嵌套外观不会成为另一套数据真相。权威 `Scene.nodes` 仍是扁平时间线，
C 形范围使用稳定配对标记保存：

```ts
type CgDisplayNode = {
  id: string;
  type: 'cgDisplay';
  assetId: string;
  leadInMs: number; // safe integer, 0..60000
};

type CgEndDisplayNode = {
  id: string;
  type: 'cgEndDisplay';
  cgDisplayNodeId: string;
};
```

例如一块含两句对白的 CG 在文件中是：

```text
cgDisplay(assetId, leadInMs)
  dialogue(...)
  dialogue(...)
cgEndDisplay(cgDisplayNodeId)
```

`cgEndDisplay` 是内部标记，不会出现在 Toolbox、表单节点列表或最终 Blockly 工作区。
图片必须引用项目中现有的 image Asset。界面把秒数乘以 1000 并四舍五入为整数毫秒后
再发给后端，文件不会持久化浮点秒数。

## 3. C++ 权威命令与结构保护

Editor 通过以下窄命令修改 CG：

```text
cgDisplay.add
cgDisplay.update
cgDisplay.delete
cgDisplay.reorder
```

新增命令只会发送一个定位锚点：有 `beforeNodeId` 时不再发送 `afterNodeId`；追加到末尾时
才使用最后一个权威节点作为 `afterNodeId`。C++ Core 会一次创建 root 与 end marker，
更新先验证图片类型和毫秒范围，删除与重排始终操作完整的 `root..end` 范围。

结构校验保证：

- root 与 end marker 的 owner ID 精确匹配；
- body 为空时仍是合法积木，非空时每个节点都必须是 Dialogue；
- 完整 CG 可位于 If/Else/Repeat 的一个分支内，但不能跨越分支或“延伸”分页；
- 通用单节点删除不能删除 root/marker；
- `timeline.reorderMany` 只有在选择完整 CG 范围时才允许携带它移动，以便整页重排；
- 所有变更先作用于候选副本，完整项目校验成功后才交换；失败时 Project 与 revision 不变。

Main 的 invocation validator、Preload API 和 Backend JSONL 参数都采用 exact-field 校验。
Main 的后端响应解析器同时认识并净化两个新节点；畸形响应会立刻拒绝对应 pending 请求，
不会伪装成十秒请求超时。开发环境若仍运行旧 Main/Preload/C++，Renderer 会显示“模块尚未
加载，请完全退出并重新启动 Editor”，而不是继续发送不可用命令。

## 4. Blockly 投影与事件流程

投影器先解析扁平 paired markers，再创建一个 `vn_cg_display` C 形块，把范围内对白连接到
`BODY` statement input。end marker ID 只保存在投影块的内部 data 中，用于空 body 的新增
锚点和完整范围重排，不由 Renderer 猜测或重新生成。

编辑遵循 backend-first 流程：

1. 用户拖入、修改、删除或移动 CG 块；
2. Renderer 解析图片、整数毫秒和权威定位锚点；
3. 工作区在请求期间只读；
4. C++ 成功后返回完整快照，Renderer 重新投影；
5. 校验失败、旧模块、异常或并发冲突时恢复最后一份权威投影。

拖入 CG BODY 的非对白积木会在任何通用 add/reorder IPC 之前被拒绝。移动普通对白进入或
离开 CG body 仍使用通用 timeline reorder，并由候选结构校验兜底。隐藏 end marker 不参与
框选；“全选可见积木”仍只移动 Blockly 布局，不会误改业务时间线。

## 5. Runtime、计时与媒体生命周期

Runtime v8 首次新增、当前 Runtime v10 继续使用以下阻塞状态与展示字段：

```ts
status: 'waitingCgLeadIn' | /* existing states */;
cgAssetId: string | null;
cgLeadInMs: number;
cgSequence: number;
```

进入 root 时 Runtime 立即设置 CG、递增 `cgSequence`，并把游标停在 body 第一项之前。
Player/Editor 先解析同源媒体 URL，等 `<img>` 成功 load/decode 后才启动计时；因此网络或
磁盘读取时间不会挤占作者设置的“CG 已可见”时长。图片无法解析或解码时不会静默跳到对白，
而是显示可本地化错误并允许返回标题或退出预览。

计时器保存本次剩余毫秒，并在以下状态暂停：

- 游戏暂停；
- 选项、存档、读档或其他交互模态层打开；
- 页面进入 `document.hidden`；
- Player 的统一媒体暂停门闩生效。

恢复后只继续剩余时长；组件卸载、返回标题或换包会清除 timer 和迟到的媒体解析结果。
读档恢复 `waitingCgLeadIn` 时按约定重新播放完整 lead-in，不持久化不可靠的墙钟剩余时间。
CG 是视觉层，进入等待态不会停止或重置 BGM；没有对白时 voice 保持为空。

倒计时完成调用纯函数 `completeCgLeadIn(project, runtime)`。它重新核对当前 Scene、root、
配对范围、图片和毫秒字段，再进入第一句对白。处理 end marker 时清除 CG；空 body 会在
计时完成后立即经过 end marker并继续后续剧情。

## 6. 保存、导出与兼容

- Writer 固定写 author v20；Reader 支持 v1–v20，v1–v16 迁移后没有 CG 显示节点；
- 伪装成旧版本的 `cgDisplay` / `cgEndDisplay` 会被严格拒绝；
- Editor Main 把 author v20 编译为 runtime v10，并把 CG 图片纳入导出资源闭包；
- 当前 runtime v10 manifest 使用 `playerCompatibility: ">=10 <11"`；
- Desktop/Web Player Reader 支持 runtime v1–v10，CG 节点从 v8 起可用；
- 当前 Player 模板使用 `runtimeCompatibility: ">=1 <11"`。

游戏进度当前使用 `GameRuntimeSnapshot v4`，继续保存 snapshot v3 引入的 `cgAssetId`、
`cgLeadInMs` 和 `cgSequence`，并增加人物特效的最终视觉状态。恢复时不会信任派生对白或
任意图片路径，而是从当前 runtime Project 的配对范围重建并验证。v1–v3 仅按各自旧能力
受限兼容，旧快照不能伪造更高版本状态。
桌面存档的原子文件和 Web IndexedDB 共用同一快照解析器。

## 7. 技术栈与主要文件

| 层 | 技术与职责 |
| --- | --- |
| C++ Core | C++20、`std::variant`、候选副本事务、paired range 校验 |
| C++ Backend | nlohmann/json、JSONL、exact params、author v20 strict Reader/Writer |
| Electron | TypeScript protocol、trusted IPC、contextBridge、响应净化与即时 pending reject |
| Editor | React 19、Blockly 13、C 形投影、图片下拉、秒↔整数毫秒转换、表单只读树 |
| Runtime | 纯 TypeScript reducer、预编译控制流、`waitingCgLeadIn`、snapshot v4 |
| Player | React、HTML `<img>` load/decode、可暂停剩余时间、CSS 分层与本地化错误 |
| Web | Vite Web Player、同源媒体 URL、IndexedDB 存档，与 Desktop 共用 runtime v10 |

主要实现入口：

- [C++ 模型](../engine/include/vnengine/model.hpp)
- [C++ CG 命令](../engine/src/core/project.cpp)
- [C++ 结构校验](../engine/src/core/project_validation.cpp)
- [Editor CG Blockly](../apps/editor/src/renderer/features/block-editor/blocks/cgDisplayBlock.ts)
- [Editor CG 事件](../apps/editor/src/renderer/features/block-editor/cgDisplayBlockEvents.ts)
- [Author → Runtime 编译器](../apps/editor/src/main/export/AuthorProjectCompiler.ts)
- [共享 Runtime](../packages/runtime/src/gameRuntime.ts)
- [存档快照](../packages/runtime/src/gameRuntimeSnapshot.ts)
- [Player 画面与计时](../apps/player/src/renderer/GameScreen.tsx)

## 8. 验收范围

自动化回归覆盖空/多对白 body、0/60000 毫秒边界、错误资源类型、If Then/Else 与 Repeat
内嵌、跨分支/分页拒绝、完整范围移动、失败 revision 原子性、Author/Runtime 版本门禁、
Snapshot v4 round-trip、旧快照受限兼容、Desktop/Web 资源验证、图片延迟解析与解码、
暂停/模态层/隐藏页面的剩余时间、卸载 timer、BGM 连续性、图片错误态，以及 Blockly
工具箱/投影/字段/拖放/删除/表单树的中英文行为。

涉及 C++ 或 Electron Main/Preload 的代码不会通过 Vite 热更新替换。开发态升级后必须完全
退出旧 Editor 进程并重新启动，再进行真实交互验收。
