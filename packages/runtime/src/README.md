# Runtime Source

[返回 Runtime](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`characterEffect.ts`](./characterEffect.ts) | TypeScript | 严格校验人物特效参数 | `isCharacterEffect`、时长上下限 |
| [`gameRuntime.ts`](./gameRuntime.ts) | TypeScript、状态机 | 执行场景、选择、逻辑、循环、CG 和人物状态 | `startGame`、`advanceGame`、`chooseOption`、`completeCgLeadIn` |
| [`gameRuntimeSnapshot.ts`](./gameRuntimeSnapshot.ts) | TypeScript | 创建、验证、比较和恢复版本化快照 | `createGameRuntimeSnapshot`、`restoreGameRuntimeSnapshot` |
| [`index.ts`](./index.ts) | TypeScript | Runtime 公共 API 聚合入口 | 执行、快照、校验和项目类型再导出 |
| [`logicValidation.ts`](./logicValidation.ts) | TypeScript | 逻辑数据、变量和资源预算校验 | `isLogicCondition`、`validateProjectLogicVariableBudget` |
| [`projectTypes.ts`](./projectTypes.ts) | TypeScript DTO | 定义项目、场景节点、CG、特效与逻辑结构 | `ProjectDocument`、`SceneNode`、`CharacterEffect` |
