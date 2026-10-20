# Scratch Novel Engine Editor

[中文](./README.md) | [English](./README.en.md)

[返回应用目录](../README.md)

Scratch Novel Engine Editor 是基于 Electron、React、Blockly 与 C++20 后端的视觉小说创作工具。它提供表单、Blockly 和 Code 三种编辑方式，并整合资源管理、预览、项目保存和多平台导出。Renderer 只通过类型化 Preload API 访问主机能力，项目写入、媒体读取和导出均由 Main 进程负责。

Code 页按编辑目标分为两类：故事场景可编辑封闭剧情 DSL，并通过 C++ 原子场景替换
同步 Form、Blockly 与预览；主界面和 CG 画廊可编辑受限样式 DSL，提交后写入权威
`style` DTO，驱动 Editor 预览、Desktop Player 和 Web Player 的同一渲染契约。
源码只作为窗口内草稿，不作为第二份项目数据持久化。

## 工作方式

1. Renderer 从用户操作生成创作命令，通过 Preload 暴露的最小 API 送往 Main 进程。
2. Main 验证 IPC 来源和参数，再协调每个窗口独占的 C++ 后端、项目存储、媒体预览与设置服务。
3. 保存时后端快照被原子写入作者工程；导出时作者工程会编译为 Player 可读取的 Runtime 文档和资产包。

当前 Author v22 保留 v21 引入的场景初始背景、时间线
背景和人物立绘缩放；范围为 10%–300% 的整数，默认 100%。Editor 静态/正式预览与导出
Player 共用同一语义，标题页背景和 CG 不显示该缩放控件。v22 另外为主界面与 CG 画廊保存严格样式 DTO。

当前导出为 Runtime v13。Runtime v12 开始由 Main 从 Editor 设置服务取得权威
`zh-CN` / `en-US`，写入 `game.defaultLanguage`；Renderer 的导出请求不能伪造该值。
这不会翻译作者内容，也不提升 Snapshot v5。Runtime v13 在不变更剧情快照的前提下加入页面样式。

## 模块导航

| 目录 | 主要作用 |
| --- | --- |
| [`src/`](./src/README.md) | Editor 应用源码与进程边界。 |
| [`src/main/`](./src/main/README.md) | 窗口、IPC、项目文件、媒体和导出。 |
| [`src/renderer/`](./src/renderer/README.md) | 可视化编辑界面与游戏预览。 |
| [`src/shared/`](./src/shared/README.md) | Main、Preload、Renderer 共用协议。 |
| [`tests/`](./tests/README.md) | 单元测试和跨组件集成测试。 |

## 配置文件

| 文件 | 主要作用 |
| --- | --- |
| [`.eslintrc.json`](./.eslintrc.json) | 约束进程依赖方向和代码规范。 |
| [`forge.config.ts`](./forge.config.ts) | 配置应用打包和平台安装包。 |
| [`forge.env.d.ts`](./forge.env.d.ts) | 引入 Forge Vite 环境类型。 |
| [`index.html`](./index.html) | Renderer 的安全页面入口。 |
| [`package.json`](./package.json) | 定义依赖和开发、测试、打包命令。 |
| [`tsconfig.json`](./tsconfig.json) | Editor 的严格类型检查配置。 |
| [`vite.main.config.ts`](./vite.main.config.ts) | 构建 Electron Main。 |
| [`vite.preload.config.ts`](./vite.preload.config.ts) | 构建沙箱 Preload。 |
| [`vite.renderer.config.ts`](./vite.renderer.config.ts) | 构建 Renderer。 |

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm --dir apps/editor start` | 编译 C++ 后端并启动开发版 Editor。 |
| `pnpm --dir apps/editor typecheck` | 执行严格 TypeScript 检查。 |
| `pnpm --dir apps/editor lint` | 检查 Editor 源码规范和依赖边界。 |
| `pnpm --dir apps/editor test` | 运行 C++ 与 Vitest 测试。 |
| `pnpm --dir apps/editor make` | 构建后端并生成平台安装包。 |

## 开发提示

- 启动窗口会显示阶段进度：加载界面 → 读取设置 → 准备项目与恢复会话 → 同步项目状态，完成后进入编辑器。百分比表示初始化阶段，不代表剩余时间；启动失败可点击“重新连接”。
- `start` 在 Electron 启动前执行的 C++ 编译和 Player 模板准备仍在终端显示日志。修改 Main 启动逻辑后需要完全退出并重新启动 Editor。
- 修改跨进程能力时，应同步检查 [`src/shared/`](./src/shared/README.md)、Preload 和对应 Main IPC，避免让 Renderer 直接依赖 Node.js。
- `.vite/`、`out/`、`dist/`、`node_modules/` 与 CMake 构建目录都是生成内容，不属于手写源码索引。
- 日常提交至少运行 `pnpm --dir apps/editor typecheck`、`pnpm --dir apps/editor lint` 和与改动最相关的 Vitest；涉及真实后端或导出契约时再运行完整 `test`。
