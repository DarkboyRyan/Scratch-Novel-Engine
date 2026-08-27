# Player Content

[返回 Player Main](../README.md)

Content 模块负责把磁盘上的候选 `.vngame` 目录转换为可供 Renderer 使用的只读游戏视图，并管理每个 Player 窗口当前激活的 Bundle。它是本地内容进入 Runtime 之前的主要安全边界。

## 加载流程

启动来源由 `resolvePlayerStartupContent` 区分为开发夹具、通用 Player 或嵌入式单游戏。通用模式可通过本地化目录选择器选择以 `.vngame` 结尾的目录；嵌入模式只读取打包资源，明确拒绝替换游戏。

`PlayerBundleLoader` 使用 `safeFiles` 在受约束目录内稳定读取 `game.json`、`manifest.json` 和资源，检查 Schema、大小、哈希、文件类型、链接与路径逃逸。候选 Bundle 完整通过验证后，`PlayerBundleSession` 才原子切换当前游戏并轮换媒体代次；取消或失败会保留先前状态，旧会话上下文随后不能继续写入存档。

Main 侧的 `runtimeBundleSchema.ts` 只保留兼容导入路径，真正的纯解析器位于 [`../../shared/runtimeBundleSchema.ts`](../../shared/runtimeBundleSchema.ts)。不要在会话层复制 Schema，也不要为了支持非标准目录而放宽安全文件规则。

## 验证

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerBundleLoader.test.ts \
  tests/unit/playerBundleSession.test.ts \
  tests/unit/playerStartupContent.test.ts
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerBundleLoader.ts`](./PlayerBundleLoader.ts) | Node.js、TypeScript | 安全读取并校验运行包和媒体 | `loadRuntimeBundle`、`validateAssetFile` |
| [`PlayerBundleSession.ts`](./PlayerBundleSession.ts) | TypeScript | 管理当前包、选包和嵌入模式 | `PlayerBundleSession`、`openEmbedded`、`openGeneric` |
| [`resolvePlayerStartupContent.ts`](./resolvePlayerStartupContent.ts) | Electron、Node.js | 解析开发/通用/嵌入启动来源 | `resolvePlayerStartupContent` |
| [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts) | TypeScript | 保留 Main 侧稳定解析器导入路径 | 共享 schema 再导出 |
| [`safeFiles.ts`](./safeFiles.ts) | Node.js 文件系统 | 防目录逃逸、链接替换和读取竞态 | `openSafeBundleFile`、`readStableUtf8File`、`sha256File` |
| [`selectPlayerBundleDirectory.ts`](./selectPlayerBundleDirectory.ts) | Electron Dialog | 本地化选择游戏包目录 | `selectPlayerBundleDirectory` |
