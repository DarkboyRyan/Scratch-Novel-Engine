# 项目文件

项目目录是用户可见的最小持久化单位，固定清单为 `project.vn.json`，本机路径始终由 Main 控制。

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`ProjectFileSession.ts`](./ProjectFileSession.ts) | TypeScript | 维护项目路径、保存修订和脏状态。 | `ProjectFileSession` 的 bind/clear/update/snapshot 会话方法。 |
| [`ProjectFileWorkflow.ts`](./ProjectFileWorkflow.ts) | Electron Dialog、Node.js Path | 编排新建、打开和保存。 | `runProjectFileWorkflow`；协调后端、路径策略、发布器、预览和窗口。 |
| [`ProjectPathPolicy.ts`](./ProjectPathPolicy.ts) | Node.js FS | 规范并约束项目根目录和清单路径。 | `validateProjectRootPath`、`canonicalizeProjectRootPath`、`resolveProjectManifestPath`、安全创建/清理。 |
| [`ProjectPublisher.ts`](./ProjectPublisher.ts) | Node.js FS、Crypto | 原子发布后端保存快照。 | `publishProjectSnapshot`；验证快照、临时写入、同步并替换正式清单。 |
| [`ProjectStorageSession.ts`](./ProjectStorageSession.ts) | Node.js FS | 管理项目资产存储会话。 | `ProjectStorageSession`；受控根目录、临时区、资产导入和安全相对路径。 |
