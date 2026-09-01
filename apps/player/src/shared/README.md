# Player Shared

[返回 Player Source](../README.md)

供 Main、Preload、Renderer 与 Web 共用的纯类型和解析边界。

Shared 是 Player 各执行环境之间的协议权威来源。这里的模块可以被 Electron Main、沙箱化 Renderer、Preload、Node 发布脚本和浏览器构建共同导入，所以只包含 TypeScript 类型、常量、守卫和无副作用解析逻辑。

## 协议分层

`playerProtocol.ts` 定义 IPC action、公开游戏视图、稳定错误码、设置版本与 Patch、存档槽位和结果联合类型。设置读取结果还携带 `default`/`stored` 语言来源，让 Renderer 能安全区分包默认语言与玩家偏好。Preload 暴露的 `VnPlayerApi` 与 Renderer 使用的 Gateway 以此为基础，但磁盘路径、资源哈希和内部异常不属于公开协议。

`runtimeBundleSchema.ts` 对 `game.json` 与 `manifest.json` 做严格、版本化解析，验证精确字段、
ID、场景控制流、逻辑限制、资源引用、图片缩放、兼容范围和清单元数据。当前 Writer/Reader
边界为 Runtime v12 / v1–v12；Runtime v11 是精确要求 10–300 整数缩放的历史
里程碑，v12 还严格要求 `defaultLanguage`，旧 v1–v11 迁移为 `zh-CN`。
`playerMediaContract.ts` 维护跨宿主一致的资源目录、MIME 和大小政策；`webExportProtocol.ts`
额外约束静态 Web 导出的描述文件和安全 game root。

## 变更规则

协议和存储文档的版本不能依赖“尽量解析”。新增字段应选择明确升级版本或提供受测迁移，未知字段继续拒绝。除 `global.d.ts` 的 Window 类型声明外，共享业务模块不得导入 `electron`、`node:*`、React 或浏览器全局；环境特有的读取与错误处理留给对应宿主。

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerSettingsProtocol.test.ts \
  tests/unit/playerBundleLoader.test.ts \
  tests/unit/webExportProtocol.test.ts
pnpm --dir apps/player typecheck
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`global.d.ts`](./global.d.ts) | TypeScript | 声明 Preload 注入对象 | `Window.vnPlayer` |
| [`playerMediaContract.ts`](./playerMediaContract.ts) | TypeScript | MIME、目录和媒体大小规则 | `mimeForPlayerAsset`、`maximumPlayerMediaBytes` |
| [`playerProtocol.ts`](./playerProtocol.ts) | TypeScript | IPC、设置、资源和存档协议 | `PlayerInvocation`、`VnPlayerApi`、设置守卫 |
| [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts) | TypeScript | 多版本运行包严格解析 | `parseRuntimeBundleDocuments`、引用验证 |
| [`webExportProtocol.ts`](./webExportProtocol.ts) | TypeScript | Web 导出描述协议 | `parseWebExportDescriptor`、兼容范围 |
