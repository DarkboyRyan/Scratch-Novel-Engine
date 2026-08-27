# Player

[返回项目首页](../../README.md)

Electron 桌面 Player 与 Web Player 的宿主应用，负责加载导出游戏、播放剧情、保存进度和发布模板。

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
