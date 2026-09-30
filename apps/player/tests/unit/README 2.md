# Player Unit Tests

[返回 Player Tests](../README.md)

这里集中覆盖 Player 的应用代码。测试文件大致对应五条边界：Runtime Bundle 与启动内容、IPC/Preload/媒体安全、存档与设置持久化、Renderer/共享 UI 交互，以及 Web Loader/Gateway/IndexedDB 行为。

## 测试方式

Node 侧用系统临时目录和真实文件操作检查原子写入、链接防护、内容替换及大小/哈希策略；Electron 能力通过窄接口 mock，确保只模拟当前模块需要的行为。React 测试运行在 jsdom，通过 Gateway 或媒体端口注入状态，并以可访问名称、键盘事件和可见结果断言。样式测试读取 `player.css` 的关键契约，保护低高度布局、字体缩放、特效和 Modal 层级。

运行全部或指定文件：

```bash
pnpm --dir apps/player exec vitest run
pnpm --dir apps/player exec vitest run tests/unit/playerRenderer.test.tsx
```

新测试应靠近对应边界并使用稳定公开行为。避免绑定内部 hook 调用次数、生成 token 的具体值或机器相关绝对路径；安全失败场景则应明确断言不会提交会话、不会泄露路径且不会留下部分文件。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`gameScreenCgDisplay.test.tsx`](./gameScreenCgDisplay.test.tsx) | Vitest、jsdom、React | 验证 CG 引导时长、暂停、错误与切换 | 延迟 Promise、Runtime 夹具、DOM 交互 |
| [`playerBuildConfig.test.ts`](./playerBuildConfig.test.ts) | Vitest、Node.js | 验证构建环境、路径和嵌入资源约束 | 临时目录、`resolvePlayerBuildConfig` |
| [`playerBundleDialog.test.ts`](./playerBundleDialog.test.ts) | Vitest | 验证原生目录选择参数和取消流程 | Electron Dialog mock |
| [`playerBundleLoader.test.ts`](./playerBundleLoader.test.ts) | Vitest、Node.js | 验证运行包、资源、哈希和文件安全 | `makeImageBundle`、真实临时文件 |
| [`playerBundleSession.test.ts`](./playerBundleSession.test.ts) | Vitest | 验证通用/嵌入会话切换与媒体激活 | `makeBundle`、MediaService mock |
| [`playerMediaPolicy.test.ts`](./playerMediaPolicy.test.ts) | Vitest、Buffer | 验证图片、音频和视频魔数策略 | MP4/WebM/MP3/WAV/Ogg 夹具 |
| [`playerMediaService.test.ts`](./playerMediaService.test.ts) | Vitest、Streams | 验证媒体令牌、Range、MIME 与失效会话 | `makeService`、协议 mock |
| [`playerMediaVolume.test.tsx`](./playerMediaVolume.test.tsx) | Vitest、jsdom | 验证主音量与通道音量同步 | HTMLMediaElement mock、React 渲染 |
| [`playerPreload.test.ts`](./playerPreload.test.ts) | Vitest | 验证最小 Preload API 与 IPC 通道 | Electron hoisted mock |
| [`playerRenderer.test.tsx`](./playerRenderer.test.tsx) | Vitest、jsdom、React | 覆盖标题、游戏、包默认语言加载竞态、背景/立绘缩放、存读档、选项和快进主流程 | Gateway mock、键盘/按钮交互 |
| [`playerSaveStore.test.ts`](./playerSaveStore.test.ts) | Vitest、Node.js | 验证原子存档、安全恢复、兼容和错误处理 | `makeStore`、真实文件夹具 |
| [`playerSettingsManager.test.ts`](./playerSettingsManager.test.ts) | Vitest、Electron mock | 验证语言来源、窗口预设、全屏和写入协调 | `FakeWindow`、`FakeSettingsStore` |
| [`playerSettingsProtocol.test.ts`](./playerSettingsProtocol.test.ts) | Vitest | 验证设置版本、Patch 和存档摘要协议 | 类型守卫、默认值、迁移输入 |
| [`playerSettingsQuitCoordinator.test.ts`](./playerSettingsQuitCoordinator.test.ts) | Vitest | 验证并发退出只刷盘一次 | `deferred`、事件 mock |
| [`playerSettingsStore.test.ts`](./playerSettingsStore.test.ts) | Vitest、Node.js | 验证设置来源、原子写入、备份、迁移和链接防护 | `makeStore`、临时目录 |
| [`playerStartupContent.test.ts`](./playerStartupContent.test.ts) | Vitest、Node.js | 验证开发、通用和嵌入启动模式 | 环境 mock、目录/链接夹具 |
| [`playerTypographyScale.test.ts`](./playerTypographyScale.test.ts) | Vitest、CSS 契约 | 验证窗口预设同步缩放整体字号 | CSS 规则读取与断言 |
| [`playerUiLocalization.test.tsx`](./playerUiLocalization.test.tsx) | Vitest、jsdom、React | 验证中英文 UI、ARIA 与错误文本 | Provider/组件渲染、控件交互 |
| [`registerPlayerIpc.test.ts`](./registerPlayerIpc.test.ts) | Vitest、Electron mock | 验证可信 IPC、参数拒绝和服务分派 | 注册器 mock、可信事件夹具 |
| [`titleModalStyle.test.ts`](./titleModalStyle.test.ts) | Vitest、CSS 契约 | 验证标题页 Modal 视觉层级与控件样式 | CSS selector 解析 |
| [`titleScreenAutoFit.test.ts`](./titleScreenAutoFit.test.ts) | Vitest | 验证标题页缩放边界和 CSS 接线 | `calculateAutoFitScale`、CSS 断言 |
| [`visualStageCharacterEffects.test.tsx`](./visualStageCharacterEffects.test.tsx) | Vitest、jsdom | 验证立绘特效 class、变量、重播和暂停 | `VisualStage` 渲染、CSS 动画契约 |
| [`viteRendererConfig.test.ts`](./viteRendererConfig.test.ts) | Vitest、Vite | 防止 workspace 包被陈旧预构建缓存接管 | Renderer config 断言 |
| [`viteWebConfig.test.ts`](./viteWebConfig.test.ts) | Vitest、Vite | 验证 Web 模板入口、base 和输出目录 | Web config 解析 |
| [`webBundleLoader.test.ts`](./webBundleLoader.test.ts) | Vitest、Web Crypto | 验证 Web 文档加载、限制、哈希和路径 | Fetch mock、`fetchDocuments` |
| [`webExportProtocol.test.ts`](./webExportProtocol.test.ts) | Vitest | 验证 Web 描述文件严格字段和兼容范围 | `validDescriptor`、parser 断言 |
| [`webOptionsCapabilities.test.tsx`](./webOptionsCapabilities.test.tsx) | Vitest、jsdom | 验证浏览器显示能力下的选项状态 | Fullscreen mock、React 交互 |
| [`webPlayerGateway.test.ts`](./webPlayerGateway.test.ts) | Vitest、jsdom | 验证浏览器 Gateway 的全屏、设置来源、存档和加载 | 内存文档库、Fullscreen mock |
| [`webStorage.test.ts`](./webStorage.test.ts) | Vitest | 验证 Web 存储隔离、槽位、指纹和设置来源 | `MemoryDocuments`、Runtime 快照 |
