# Player Shared

[返回 Player Source](../README.md)

供 Main、Preload、Renderer 与 Web 共用的纯类型和解析边界。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`global.d.ts`](./global.d.ts) | TypeScript | 声明 Preload 注入对象 | `Window.vnPlayer` |
| [`playerMediaContract.ts`](./playerMediaContract.ts) | TypeScript | MIME、目录和媒体大小规则 | `mimeForPlayerAsset`、`maximumPlayerMediaBytes` |
| [`playerProtocol.ts`](./playerProtocol.ts) | TypeScript | IPC、设置、资源和存档协议 | `PlayerInvocation`、`VnPlayerApi`、设置守卫 |
| [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts) | TypeScript | 多版本运行包严格解析 | `parseRuntimeBundleDocuments`、引用验证 |
| [`webExportProtocol.ts`](./webExportProtocol.ts) | TypeScript | Web 导出描述协议 | `parseWebExportDescriptor`、兼容范围 |
