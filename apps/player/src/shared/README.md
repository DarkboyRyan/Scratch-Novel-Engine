# Player Shared

[中文](./README.md) | [English](./README.en.md)

[返回 Player Source](../README.md)

这里是 Main、Preload、Renderer、发布脚本和 Web 共用的协议与解析层，只包含类型、常量、守卫和无副作用逻辑。

`playerProtocol.ts` 定义 IPC、游戏视图、错误码、设置和存档结果。设置带有 `default`/`stored` 语言来源，供界面区分包默认与玩家偏好；磁盘路径、哈希和内部异常不属于公开协议。

`runtimeBundleSchema.ts` 严格解析运行包：Writer 为 v13，Reader 支持 v1–v13。v11 引入 10%–300% 整数缩放，v12 要求 `defaultLanguage`，v13 要求标题页和 CG 样式；旧版本补齐默认值。媒体契约统一目录、MIME 和大小规则，Web 导出协议额外约束描述文件与游戏根目录。

新增字段应升级版本或提供经过测试的迁移，继续拒绝未知字段。除 Window 类型声明外，共享模块不依赖 Electron、Node、React 或浏览器全局。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerSettingsProtocol.test.ts \
  tests/unit/playerBundleLoader.test.ts \
  tests/unit/webExportProtocol.test.ts
pnpm --dir apps/player typecheck
```

## 主要文件

- [`global.d.ts`](./global.d.ts)
- [`playerMediaContract.ts`](./playerMediaContract.ts)
- [`playerProtocol.ts`](./playerProtocol.ts)
- [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts)
- [`webExportProtocol.ts`](./webExportProtocol.ts)
