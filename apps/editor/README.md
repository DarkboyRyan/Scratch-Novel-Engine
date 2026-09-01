# VN Engine Editor

[返回应用目录](../README.md)

VN Engine Editor 是基于 Electron、React、Blockly 与 C++20 后端的视觉小说创作工具。它同时提供表单与图形化编辑方式，并把资源管理、即时预览、项目持久化和多平台导出组织在同一工作流中。Renderer 只通过类型化 Preload API 访问主机能力，项目写入、媒体读取和导出均由 Main 进程负责。

## 工作方式

1. Renderer 从用户操作生成创作命令，通过 Preload 暴露的最小 API 送往 Main 进程。
2. Main 验证 IPC 来源和参数，再协调每个窗口独占的 C++ 后端、项目存储、媒体预览与设置服务。
3. 保存时后端快照被原子写入作者工程；导出时作者工程会编译为 Player 可读取的 Runtime 文档和资产包。

当前 Author v21 允许在资源面板设置场景初始背景缩放，并在表单或 Blockly 中设置时间线
背景和人物立绘缩放；范围为 10%–300% 的整数，默认 100%。Editor 静态/正式预览与导出
Player 共用同一语义，标题页背景和 CG 不显示该控件。

当前导出为 Runtime v12。导出开始时 Main 从 Editor 设置服务取得权威
`zh-CN` / `en-US`，写入 `game.defaultLanguage`；Renderer 的导出请求不能伪造该值。
这不会翻译作者内容，也不提升 Author v21 或 Snapshot v5。

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

## 开发提示

- 修改跨进程能力时，应同步检查 [`src/shared/`](./src/shared/README.md)、Preload 和对应 Main IPC，避免让 Renderer 直接依赖 Node.js。
- `.vite/`、`out/`、`dist/`、`node_modules/` 与 CMake 构建目录都是生成内容，不属于手写源码索引。
- 日常提交至少运行 `pnpm --dir apps/editor typecheck`、`pnpm --dir apps/editor lint` 和与改动最相关的 Vitest；涉及真实后端或导出契约时再运行完整 `test`。
