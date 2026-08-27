# Runtime Source

[返回 Runtime](../README.md)

本目录实现 Runtime 的公共类型与纯状态转换。`projectTypes.ts` 描述规范化输入，
`gameRuntime.ts` 执行剧情，`gameRuntimeSnapshot.ts` 负责版本化进度；其他模块提供严格的
数据守卫和资源预算。调用方应从 `index.ts` 导入，不依赖内部文件布局。

## 执行流程

`startGame` 创建状态后，`advanceGame` 会连续处理背景、立绘、BGM、变量和控制标记，直到
出现需要宿主交互的状态。选择、视频完成和 CG lead-in 由宿主显式回传。控制流编译器会
验证 If/Else、Repeat 与 CG 的配对关系；无效结构转换为稳定的 Runtime 错误，而不是执行
未校验数据。

Snapshot v4 保存恢复剧情所需的最小状态，包括变量、循环栈、CG、人物层与最终透明度。
瞬时人物特效本身不持久化，只保留序号以避免恢复时重复触发。

## 文件索引

| 文件 | 主要作用 | 关键 API / 类型 |
| --- | --- | --- |
| [`projectTypes.ts`](./projectTypes.ts) | 定义项目、场景、媒体、CG、逻辑与人物数据。 | `ProjectDocument`、`SceneNode`、`CharacterEffect` |
| [`gameRuntime.ts`](./gameRuntime.ts) | 执行场景、分支、逻辑、循环、CG 与人物状态。 | `startGame`、`advanceGame`、`selectChoice`、`completeCgLeadIn` |
| [`gameRuntimeSnapshot.ts`](./gameRuntimeSnapshot.ts) | 创建、校验、比较并恢复 Snapshot v1–v4。 | `createGameRuntimeSnapshot`、`restoreGameRuntimeSnapshot` |
| [`logicValidation.ts`](./logicValidation.ts) | 校验逻辑 AST、变量与执行预算。 | `isLogicCondition`、`validateProjectLogicVariableBudget` |
| [`characterEffect.ts`](./characterEffect.ts) | 校验七类人物特效的严格判别结构。 | `isCharacterEffect`、时长边界 |
| [`index.ts`](./index.ts) | 聚合 Runtime 唯一公共 API。 | 执行、快照、校验与类型再导出 |

## 修改约定

- 保持函数输入输出可序列化，不读取时间、磁盘或 DOM。
- 新的自动节点必须受单次推进步数限制，新的循环状态必须进入 Snapshot。
- 改动公共类型或错误码后运行 `pnpm --dir packages/runtime test`，并检查 Editor/Player
  消费端的类型检查。
