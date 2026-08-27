# Player Content

[返回 Player Main](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerBundleLoader.ts`](./PlayerBundleLoader.ts) | Node.js、TypeScript | 安全读取并校验运行包和媒体 | `loadRuntimeBundle`、`validateAssetFile` |
| [`PlayerBundleSession.ts`](./PlayerBundleSession.ts) | TypeScript | 管理当前包、选包和嵌入模式 | `PlayerBundleSession`、`openEmbedded`、`openGeneric` |
| [`resolvePlayerStartupContent.ts`](./resolvePlayerStartupContent.ts) | Electron、Node.js | 解析开发/通用/嵌入启动来源 | `resolvePlayerStartupContent` |
| [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts) | TypeScript | 保留 Main 侧稳定解析器导入路径 | 共享 schema 再导出 |
| [`safeFiles.ts`](./safeFiles.ts) | Node.js 文件系统 | 防目录逃逸、链接替换和读取竞态 | `openSafeBundleFile`、`readStableUtf8File`、`sha256File` |
| [`selectPlayerBundleDirectory.ts`](./selectPlayerBundleDirectory.ts) | Electron Dialog | 本地化选择游戏包目录 | `selectPlayerBundleDirectory` |
