# Player

[返回应用目录](../README.md)

Electron 桌面 Player 与 Web Player 的宿主应用，负责加载导出游戏、播放剧情、保存进度和发布模板。

Player 是运行时宿主，不负责编辑项目。桌面版既可以作为通用播放器打开外部 `.vngame` 目录，也可以在发布时嵌入单个游戏；Web 版则从同源静态站点读取已经导出的游戏。两种宿主共用 React 界面、Runtime 状态机与组件库，但使用不同的内容读取、存储和显示能力。

## 架构概览

桌面版由 Electron Main、Preload 和 Renderer 三层组成。Main 独占文件系统、原生窗口、存档目录和自定义媒体协议；Preload 只暴露 `VnPlayerApi` 中列出的调用；Renderer 通过 `PlayerGateway` 播放剧情，不接触绝对路径或原始文件句柄。Web 版实现同一个 Gateway，改用 Fetch、Web Crypto、IndexedDB 与 Fullscreen API，因此不能选择本地游戏目录，也不能调整操作系统窗口尺寸。

正常加载流程是：宿主验证 `game.json`、`manifest.json` 及资源清单，生成只包含项目和安全资源标识的游戏视图，然后 Renderer 创建 Runtime 并交给共享 UI 展示。存档保存的是版本化 Runtime 快照；媒体始终通过宿主提供的受控 URL 解析，不把底层路径传给界面。

## 本地开发

在仓库根目录安装依赖后，可使用以下命令：

```bash
pnpm --dir apps/player start
pnpm --dir apps/player test
pnpm --dir apps/player typecheck
pnpm --dir apps/player lint
pnpm --dir apps/player prepare:web-template
```

`start` 启动桌面 Player，开发模式会使用 [`fixtures/game`](./fixtures/game/) 中的最小运行包。`prepare:web-template` 构建并暂存供 Editor 导出的 Web Player 模板；生成的 `.vite/`、`dist/` 和 `out/` 不应手工维护。

修改跨宿主行为时，应先确认能力属于 Gateway、共享协议还是某个宿主实现。文件读取、签名和存储策略不能下沉到 React 组件；仅桌面可用的能力必须通过 capability 字段或明确的错误结果表达，不能在 Web 中伪造成功。

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `src` | Electron、React、TypeScript | Player 主进程、Preload、桌面界面、共享协议与 Web 实现 | [查看](./src/README.md) |
| `scripts` | Node.js ESM、Electron Forge | 构建、签名、模板暂存和发布校验脚本 | [查看](./scripts/README.md) |
| `tests` | Vitest、jsdom | Player 单元与集成测试 | [查看](./tests/README.md) |
| `fixtures` | Runtime JSON | CI 与构建验证使用的最小游戏包 | [查看](./fixtures/README.md) |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`.eslintrc.json`](./.eslintrc.json) | ESLint | Player TypeScript/React 静态检查规则 | Parser、Import 和 TypeScript 规则 |
| [`forge.config.ts`](./forge.config.ts) | Electron Forge | 打包、制品、Fuse 与嵌入资源配置 | `verifyEmbeddedResource`、Forge makers/plugins |
| [`forge.env.d.ts`](./forge.env.d.ts) | TypeScript | Forge Vite 环境类型入口 | `forge-vite-env` 类型引用 |
| [`index.html`](./index.html) | HTML、CSP | 桌面 Renderer 页面容器 | `#root`、Renderer 模块入口 |
| [`package.json`](./package.json) | pnpm、Electron | 依赖与开发、测试、构建命令 | `start`、`test`、`make`、CI scripts |
| [`tsconfig.json`](./tsconfig.json) | TypeScript | Player 编译边界和路径设置 | Electron/DOM 类型、workspace 引用 |
| [`vite.main.config.ts`](./vite.main.config.ts) | Vite | Main 进程构建 | `defineConfig` |
| [`vite.preload.config.ts`](./vite.preload.config.ts) | Vite | Preload 构建 | `defineConfig` |
| [`vite.renderer.config.ts`](./vite.renderer.config.ts) | Vite、React | 桌面 Renderer 构建 | React 插件、workspace 依赖排除 |
| [`vite.web.config.ts`](./vite.web.config.ts) | Vite、React | Web Player 模板构建 | 固定 `base`、安全输出目录 |

`.vite/`、`dist/`、`out/`、`node_modules/` 为生成或依赖目录，不纳入源码索引。
