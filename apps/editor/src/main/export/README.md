# 游戏导出

导出流程先编译作者工程，再以稳定快照、哈希校验和原子发布生成可分发产物。

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`AuthorProjectCompiler.ts`](./AuthorProjectCompiler.ts) | TypeScript、Runtime DTO | 将作者工程编译为 Runtime v9 文档。 | `compileAuthorProjectV15`；迁移版本、过滤编辑节点、校验控制流、CG、特效和资产引用。 |
| [`ExportFileLock.ts`](./ExportFileLock.ts) | Node.js FS、Process、Net | 避免多个进程同时写入同一导出目标。 | `acquireExportFileLock`；校验锁持有者并返回幂等释放租约。 |
| [`ExportGameWorkflow.ts`](./ExportGameWorkflow.ts) | Electron Dialog | 统一编排三种导出模式。 | `runExportGameWorkflow`；选择目标、加载 Player 模板并路由导出器。 |
| [`RuntimeBundleExporter.ts`](./RuntimeBundleExporter.ts) | Node.js FS、Crypto | 生成 `game.json`、资产和完整性清单。 | `exportRuntimeBundle`；稳定复制、SHA-256、暂存验证、目录同步和原子提交。 |
| [`StandaloneApplicationExporter.ts`](./StandaloneApplicationExporter.ts) | Node.js FS、平台命令 | 生成 Windows、macOS 或 Linux 独立应用。 | `exportStandaloneApplication`、`finalizeStandaloneApplication`、归档/解压/签名验证；严格控制模板树和发布所有权。 |
| [`StandalonePlayerTemplate.ts`](./StandalonePlayerTemplate.ts) | Node.js FS | 发现并验证平台 Player 模板。 | `resolveStandalonePlayerTemplateRoot`、`loadStandalonePlayerTemplate`；检查平台、架构、清单和入口。 |
| [`WebPlayerExporter.ts`](./WebPlayerExporter.ts) | Node.js FS、yazl/yauzl | 生成 Web 目录或 `WebGL.zip`。 | `exportWebPlayer`、`archiveWebPlayerTree`、`verifyWebPlayerArchive`；稳定复制、确定性 ZIP 与归档安全检查。 |
| [`WebPlayerTemplate.ts`](./WebPlayerTemplate.ts) | Node.js FS、Crypto | 发现并快照 Web Player 模板。 | `resolveWebPlayerTemplateRoot`、`loadWebPlayerTemplate`；检查清单、入口、文件身份和哈希。 |
