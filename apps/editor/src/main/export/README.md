# 游戏导出

[返回 Electron Main](../README.md)

本目录把 Editor 的作者工程转换为 Player 可运行、可分发的产物。导出流程先编译作者工程，再以稳定快照、哈希校验和原子发布生成 Runtime Bundle、Web/WebGL ZIP 或独立应用，避免把编辑期节点和不完整资产带入成品。

## 架构位置与工作方式

1. `ExportGameWorkflow.ts` 接收已验证的导出模式、选择目标，并取得稳定作者工程和 Player 模板。
2. `AuthorProjectCompiler.ts` 生成 Runtime 文档，各导出器在临时位置复制资产、模板并建立完整性信息。
3. 校验产物或归档后再原子提交到用户目标；文件锁阻止多个进程并发发布同一位置。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`AuthorProjectCompiler.ts`](./AuthorProjectCompiler.ts) | TypeScript、Runtime DTO | 将作者工程编译为 Runtime v10 文档。 | `compileAuthorProjectV15` 直接严格读取 v14–v20；v1–v13 先由 `RuntimeBundleExporter` 通过 C++ canonical snapshot 迁移。随后投影标题上方文字、过滤编辑节点，并校验控制流、CG、特效和资产引用。 |
| [`ExportFileLock.ts`](./ExportFileLock.ts) | Node.js FS、Process、Net | 避免多个进程同时写入同一导出目标。 | `acquireExportFileLock`；校验锁持有者并返回幂等释放租约。 |
| [`ExportGameWorkflow.ts`](./ExportGameWorkflow.ts) | Electron Dialog | 统一编排三种导出模式。 | `runExportGameWorkflow`；选择目标、加载 Player 模板并路由导出器。 |
| [`RuntimeBundleExporter.ts`](./RuntimeBundleExporter.ts) | Node.js FS、Crypto | 生成 `game.json`、资产和完整性清单。 | `exportRuntimeBundle`；稳定复制、SHA-256、暂存验证、目录同步和原子提交。 |
| [`StandaloneApplicationExporter.ts`](./StandaloneApplicationExporter.ts) | Node.js FS、平台命令 | 在 macOS 与 Windows x64 本地生成同平台独立应用 ZIP。 | `exportStandaloneApplication`、`finalizeStandaloneApplication`、归档/解压/签名或全树哈希复验；严格控制模板树和发布所有权。 |
| [`StandalonePlayerTemplate.ts`](./StandalonePlayerTemplate.ts) | Node.js FS | 发现并验证平台 Player 模板。 | `resolveStandalonePlayerTemplateRoot`、`loadStandalonePlayerTemplate`；检查平台、架构、清单和入口。 |
| [`WebPlayerExporter.ts`](./WebPlayerExporter.ts) | Node.js FS、yazl/yauzl | 生成 Web 目录或 `WebGL.zip`。 | `exportWebPlayer`、`archiveWebPlayerTree`、`verifyWebPlayerArchive`；稳定复制、确定性 ZIP 与归档安全检查。 |
| [`WebPlayerTemplate.ts`](./WebPlayerTemplate.ts) | Node.js FS、Crypto | 发现并快照 Web Player 模板。 | `resolveWebPlayerTemplateRoot`、`loadWebPlayerTemplate`；检查清单、入口、文件身份和哈希。 |

## 开发与验证

- 导出必须保持确定性、路径逃逸防护和失败不覆盖旧产物；模板或文件在校验后发生变化时应拒绝发布。
- macOS 使用 `ditto` 保留应用包并复验 codesign；Windows 使用固定参数 PowerShell 保留应用目录，并在两轮解压后逐文件复验路径、大小和 SHA-256。Windows 本地结果属于 internal 制品，正式 Authenticode 签名仍由发布 CI 完成。
- 修改作者格式或 Runtime 格式时，同步检查 [`../../shared/projectTypes.ts`](../../shared/projectTypes.ts) 和 Player Loader 兼容性。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/authorProjectCompiler.test.ts tests/unit/runtimeBundleExporter.test.ts tests/unit/webPlayerExporter.test.ts`；跨应用验证使用 `pnpm --dir apps/editor test:integration`。
