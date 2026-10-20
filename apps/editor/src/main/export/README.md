# 游戏导出

[中文](./README.md) | [English](./README.en.md)

[返回 Electron Main](../README.md)

本目录把 Editor 的作者工程转换为 Player 可运行、可分发的产物。导出流程先编译作者工程，再以稳定快照、哈希校验和原子发布生成 Runtime Bundle、Web/WebGL ZIP 或独立应用，避免把编辑期节点和不完整资产带入成品。

## 工作方式

1. `ExportGameWorkflow.ts` 接收已验证的导出模式、选择目标，并取得稳定作者工程和 Player 模板。
2. `AuthorProjectCompiler.ts` 生成 Runtime 文档，各导出器在临时位置复制资产、模板并建立完整性信息。
3. 校验产物或归档后再原子提交到用户目标；文件锁阻止多个进程并发发布同一位置。

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [`AuthorProjectCompiler.ts`](./AuthorProjectCompiler.ts) | 将作者工程编译为 Runtime v13 文档。 |
| [`ExportFileLock.ts`](./ExportFileLock.ts) | 避免多个进程同时写入同一导出目标。 |
| [`ExportGameWorkflow.ts`](./ExportGameWorkflow.ts) | 统一编排三种导出模式。 |
| [`RuntimeBundleExporter.ts`](./RuntimeBundleExporter.ts) | 生成 `game.json`、资产和完整性清单。 |
| [`StandaloneApplicationExporter.ts`](./StandaloneApplicationExporter.ts) | 生成 Windows、macOS 或 Linux 独立应用。 |
| [`StandalonePlayerTemplate.ts`](./StandalonePlayerTemplate.ts) | 发现并验证平台 Player 模板。 |
| [`WebPlayerExporter.ts`](./WebPlayerExporter.ts) | 生成 Web 目录或 `WebGL.zip`。 |
| [`WebPlayerTemplate.ts`](./WebPlayerTemplate.ts) | 发现并快照 Web Player 模板。 |

`compileAuthorProjectV15` 严格读取 Author v14–v22；v1–v13 先由导出器通过 C++ 标准快照迁移。编译保留标题上方文字、页面样式、剧情图片缩放和 Main 提供的界面语言，并校验控制流、CG、人物特效及资产引用。

## 开发与验证

- 导出必须保持确定性、路径逃逸防护和失败不覆盖旧产物；模板或文件在校验后发生变化时应拒绝发布。
- Runtime v13 bundle manifest 必须声明 `playerCompatibility: ">=13 <14"`；桌面和 Web
  模板声明 `runtimeCompatibility: ">=1 <14"`。`game.defaultLanguage` 必须来自导出时
  Main 权威 Editor 语言，不从 Renderer 导出 payload 接受；Web ZIP 的根
  `index.html` 也必须写入同一 `<html lang>`，避免启动前暴露错误文档语言。Runtime v11 仍是剧情图片
  缩放的历史里程碑；场景初始背景、时间线背景与人物立绘缩放必须保留，标题页背景和 CG 不增加该缩放字段。Runtime v13 必须保留两个页面的严格样式 DTO。
- 修改作者格式或 Runtime 格式时，同步检查 [`../../shared/projectTypes.ts`](../../shared/projectTypes.ts) 和 Player Loader 兼容性。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/authorProjectCompiler.test.ts tests/unit/runtimeBundleExporter.test.ts tests/unit/webPlayerExporter.test.ts`；跨应用验证使用 `pnpm --dir apps/editor test:integration`。
