# 跨进程共享契约

[中文](./README.md) | [English](./README.en.md)

[返回 Editor 源码](../README.md)

Shared 定义 Main、Preload 与 Renderer 都能安全导入的 IPC 通道、DTO、全局 API 和纯项目转换。它只包含类型、常量和无主机副作用的校验逻辑，不得依赖 Main 或 Renderer 实现，也不得暴露任意主机路径。

## 工作方式

1. 协议文件定义调用动作、参数、结果和运行时守卫，Main 与 Preload 使用相同通道常量。
2. Preload 将这些契约映射到 `window` 上的最小 API，Renderer 只通过 [`global.d.ts`](./global.d.ts) 看到能力。
3. Main 在执行特权操作前重新做运行时校验；项目转换函数则把作者模型投影到明确的 Runtime 边界。
4. 剧情图片缩放常量与守卫从 `@vnengine/runtime` 复用；协议要求 10–300 的整数，并让无
   背景和 clear 立绘规范化为 100%。
5. 可编辑剧情 Code 只发送严格 `SceneContentDraft`；`scene.content.replace` 隐藏配对
   marker 与新 ID 分配细节，并要求 Preload 的 `storyCodeContractVersion: 1`，防止 HMR
   期间把新草稿误发给旧 Main。

Editor 设置仍由 Main 持久。当前 严格的 v2 约定包含 `language` 与
`colorTheme: 'daylight' | 'moonlight'`；v1 语言文档会保留语言并自动补为 Daylight。
Runtime v13 保留 v12 引入的 `game.defaultLanguage`，在导出工作流内从 Main 权威语言注入，
不是 `exportProtocol.ts` 中由 Renderer 提供的参数；作者字段不因此翻译。`colorTheme`
只控制 编辑器界面，不进入 Author、Runtime 或导出游戏。

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [`assetProtocol.ts`](./assetProtocol.ts) | 定义资产导入动作和结果。 |
| [`editorSettingsProtocol.ts`](./editorSettingsProtocol.ts) | 定义 v2 语言与颜色主题设置。 |
| [`engineProtocol.ts`](./engineProtocol.ts) | 定义全部引擎方法、参数和响应。 |
| [`exportIpcChannel.ts`](./exportIpcChannel.ts) | 提供 Preload 安全的最小导出通道常量。 |
| [`exportProtocol.ts`](./exportProtocol.ts) | 定义运行包、Web 包和独立应用导出契约。 |
| [`filenamify-browser.d.ts`](./filenamify-browser.d.ts) | 补充浏览器入口类型。 |
| [`global.d.ts`](./global.d.ts) | 描述 Preload 注入的 Window API。 |
| [`projectFileProtocol.ts`](./projectFileProtocol.ts) | 定义项目文件动作、会话和菜单命令。 |
| [`projectTypes.ts`](./projectTypes.ts) | 扩展作者工程节点并维护 Runtime 边界。 |

## 开发与验证

- Shared 必须保持浏览器安全且可序列化，不能导入 `electron`、`node:*`、Main 服务或 React 组件。
- 修改协议时同步更新 Main 校验、Preload 包装、Renderer Gateway 和双方测试；新增字段不能只依赖静态类型。
- 运行 `pnpm --dir apps/editor typecheck`，并定向执行相关协议测试，例如 `pnpm --dir apps/editor exec vitest run tests/unit/editorSettingsProtocol.test.ts tests/unit/validateEngineInvocation.test.ts`。
