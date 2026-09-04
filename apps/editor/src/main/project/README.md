# 项目文件

[返回 Electron Main](../README.md)

本目录管理作者项目从目录选择到原子保存的完整生命周期。项目目录是用户可见的最小持久化单位，固定清单为 `project.vn.json`，本机路径始终由 Main 控制，Renderer 只看到会话状态和受控资产标识。

## 架构位置与工作方式

1. `ProjectFileWorkflow.ts` 响应新建、打开和保存，使用原生对话框取得用户选择。
2. 路径策略和存储会话规范化项目根、隔离临时资产，并把合法项目装入 C++ 后端和预览服务。
3. 保存时后端提供稳定快照，`ProjectPublisher.ts` 校验后同步临时文件并原子替换正式清单；会话随后记录修订与脏状态。
4. 当前资源删除只更新项目清单和权威聚合；磁盘文件作为未引用数据保留，不进入项目存储发布事务。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`ProjectFileSession.ts`](./ProjectFileSession.ts) | TypeScript | 维护项目路径、保存修订和脏状态。 | `ProjectFileSession` 的 bind/clear/update/snapshot 会话方法。 |
| [`ProjectFileWorkflow.ts`](./ProjectFileWorkflow.ts) | Electron Dialog、Node.js Path | 编排新建、打开和保存。 | `runProjectFileWorkflow`；协调后端、路径策略、发布器、预览和窗口。 |
| [`ProjectPathPolicy.ts`](./ProjectPathPolicy.ts) | Node.js FS | 规范并约束项目根目录和清单路径。 | `validateProjectRootPath`、`canonicalizeProjectRootPath`、`resolveProjectManifestPath`、安全创建/清理。 |
| [`ProjectPublisher.ts`](./ProjectPublisher.ts) | Node.js FS、Crypto | 原子发布后端保存快照。 | `publishProjectSnapshot`；验证快照、临时写入、同步并替换正式清单。 |
| [`ProjectStorageSession.ts`](./ProjectStorageSession.ts) | Node.js FS | 管理项目资产存储会话。 | `ProjectStorageSession`；受控根目录、临时区、资产导入和安全相对路径。 |

## 开发与验证

- 路径策略必须防止符号链接和目录逃逸；保存失败不得破坏上一份有效清单或错误清除脏状态。逻辑删除不得尝试直接清理磁盘文件。
- 项目格式变化要同步后端解析、Shared 项目类型和兼容性测试。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/projectFileSession.test.ts tests/unit/projectStorageSession.test.ts tests/unit/registerProjectFileIpc.test.ts`。
