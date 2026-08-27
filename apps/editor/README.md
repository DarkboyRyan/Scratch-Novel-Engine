# VN Engine Editor

基于 Electron、React、Blockly 与 C++20 后端的视觉小说编辑器。Renderer 只通过类型化 Preload API 访问主机能力，项目写入、媒体读取和导出均由 Main 进程负责。

## 模块导航

| 目录 | 框架技术 | 主要作用 |
| --- | --- | --- |
| [`src/`](./src/README.md) | TypeScript、Electron、React | Editor 应用源码与进程边界。 |
| [`src/main/`](./src/main/README.md) | Electron Main、Node.js | 窗口、IPC、项目文件、媒体和导出。 |
| [`src/renderer/`](./src/renderer/README.md) | React、Blockly | 可视化编辑界面与游戏预览。 |
| [`src/shared/`](./src/shared/README.md) | TypeScript DTO | Main、Preload、Renderer 共用协议。 |
| [`tests/`](./tests/README.md) | Vitest | 单元测试和跨组件集成测试。 |

## 根文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`.eslintrc.json`](./.eslintrc.json) | ESLint、TypeScript ESLint | 约束进程依赖方向和代码规范。 | 禁止 Renderer 访问 Node/Main，限制 Shared 使用 Node 内建模块。 |
| [`forge.config.ts`](./forge.config.ts) | Electron Forge、Vite、Fuses | 配置应用打包和平台安装包。 | 校验后端及 Player 模板目录，装配 Maker、VitePlugin、FusesPlugin。 |
| [`forge.env.d.ts`](./forge.env.d.ts) | TypeScript | 引入 Forge Vite 环境类型。 | 声明入口名与开发服务器等构建全局变量。 |
| [`index.html`](./index.html) | HTML、CSP | Renderer 的安全页面入口。 | 提供 React 根节点、严格 CSP 和模块入口。 |
| [`package.json`](./package.json) | pnpm、Electron Forge | 定义依赖和开发、测试、打包命令。 | `start`、`typecheck`、`test`、`make` 等脚本。 |
| [`tsconfig.json`](./tsconfig.json) | TypeScript | Editor 的严格类型检查配置。 | 开启 strict、未使用成员检查和 React JSX。 |
| [`vite.main.config.ts`](./vite.main.config.ts) | Vite | 构建 Electron Main。 | `defineConfig` 提供独立主进程入口配置。 |
| [`vite.preload.config.ts`](./vite.preload.config.ts) | Vite | 构建沙箱 Preload。 | `defineConfig` 隔离桥接脚本产物。 |
| [`vite.renderer.config.ts`](./vite.renderer.config.ts) | Vite、React | 构建 Renderer。 | React 插件与 `optimizeDeps` 工作区依赖边界。 |

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm --dir apps/editor start` | 编译 C++ 后端并启动开发版 Editor。 |
| `pnpm --dir apps/editor typecheck` | 执行严格 TypeScript 检查。 |
| `pnpm --dir apps/editor lint` | 检查 Editor 源码规范和依赖边界。 |
| `pnpm --dir apps/editor test` | 运行 C++ 与 Vitest 测试。 |
| `pnpm --dir apps/editor make` | 构建后端并生成平台安装包。 |
