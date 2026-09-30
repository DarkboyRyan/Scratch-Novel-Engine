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
| [`AuthorProjectCompiler.ts`](./AuthorProjectCompiler.ts) | TypeScript、Runtime DTO | 将作者工程编译为 Runtime v13 文档。 | `compileAuthorProjectV15` 直接严格读取 v14–v22；v1–v13 先由 `RuntimeBundleExporter` 通过 C++ canonical snapshot 迁移。随后投影标题上方文字、页面样式、剧情图片缩放与 Main 权威 Editor 语言、过滤编辑节点，并校验控制流、CG、特效和资产引用。 |
| [`ExportFileLock.ts`](./ExportFileLock.ts) | Node.js FS、Process、Net | 避免多个进程同时写入同一导出目标。 | `acquireExportFileLock`；校验锁持有者并返回幂等释放租约。 |
| [`ExportGameWorkflow.ts`](./ExportGameWorkflow.ts) | Electron Dialog | 统一编排三种导出模式。 | `runExportGameWorkflow`；选择目标、加载 Player 模板并路由导出器。 |
| [`RuntimeBundleExporter.ts`](./RuntimeBundleExporter.ts) | Node.js FS、Crypto | 生成 `game.json`、资产和完整性清单。 | `exportRuntimeBundle`；稳定复制、SHA-256、暂存验证、目录同步和原子提交。 |
| [`StandaloneApplicationExporter.ts`](./StandaloneApplicationExporter.ts) | Node.js FS、平台命令 | 生成 Windows、macOS 或 Linux 独立应用。 | `exportStandaloneApplication`、`finalizeStandaloneApplication`、归档/解压/签名验证；严格控制模板树和发布所有权。 |
| [`StandalonePlayerTemplate.ts`](./StandalonePlayerTemplate.ts) | Node.js FS | 发现并验证平台 Player 模板。 | `resolveStandalonePlayerTemplateRoot`、`loadStandalonePlayerTemplate`；检查平台、架构、清单和入口。 |
| [`WebPlayerExporter.ts`](./WebPlayerExporter.ts) | Node.js FS、yazl/yauzl | 生成 Web 目录或 `WebGL.zip`。 | `exportWebPlayer`、`archiveWebPlayerTree`、`verifyWebPlayerArchive`；稳定复制、确定性 ZIP 与归档安全检查。 |
| [`WebPlayerTemplate.ts`](./WebPlayerTemplate.ts) | Node.js FS、Crypto | 发现并快照 Web Player 模板。 | `resolveWebPlayerTemplateRoot`、`loadWebPlayerTemplate`；检查清单、入口、文件身份和哈希。 |

## 开发与验证

- 导出必须保持确定性、路径逃逸防护和失败不覆盖旧产物；模板或文件在校验后发生变化时应拒绝发布。
- Runtime v13 bundle manifest 必须声明 `playerCompatibility: ">=13 <14"`；桌面和 Web
  模板声明 `runtimeCompatibility: ">=1 <14"`。`game.defaultLanguage` 必须来自导出时
  Main 权威 Editor 语言，不从 Renderer 导出 payload 接受；Web ZIP 的根
  `index.html` 也必须写入同一 `<html lang>`，避免启动前暴露错误文档语言。Runtime v11 仍是剧情图片
  缩放的历史里程碑；场景初始背景、时间线背景与人物立绘缩放必须保留，标题页背景和 CG 不增加该缩放字段。Runtime v13 必须保留两个页面的严格样式 DTO。
- 修改作者格式或 Runtime 格式时，同步检查 [`../../shared/projectTypes.ts`](../../shared/projectTypes.ts) 和 Player Loader 兼容性。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/authorProjectCompiler.test.ts tests/unit/runtimeBundleExporter.test.ts tests/unit/webPlayerExporter.test.ts`；跨应用验证使用 `pnpm --dir apps/editor test:integration`。
