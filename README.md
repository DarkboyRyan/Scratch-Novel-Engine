# Scratch Novel Engine

Scratch Novel Engine 是一套用于创作、预览和发布视觉小说的工具链。作者可以在 Editor 中
使用表单或分类 Blockly 编辑剧情，不需要直接编写游戏运行代码；完成后的工程可导出为
Desktop Player 内容包、可部署的 Web Player，或独立游戏包。

项目把“创作数据”和“游戏运行”明确分开：C++20 Core 负责作者工程、校验与原子编辑，
平台无关的 TypeScript Runtime 负责实际剧情执行。Editor 正式预览、Desktop Player 与
Web Player 因此共享同一套剧情语义。

## 主要能力

- **可视化创作**：表单编辑与 Blockly 图形化编辑可随时切换；积木按剧情、逻辑、变量、
  音乐、图片和特效分类。
- **剧情与逻辑**：对白、选择分支、场景跳转、变量、If/Else，以及固定次数 Repeat。
- **画面与媒体**：背景、人物立绘、语音、BGM、视频、九槽 CG 画廊和剧情内 CG 展示；
  场景初始背景、时间线背景与人物立绘可按 10%–300% 的整数比例缩放。
- **人物演出**：震动、跳跃、淡入、淡出、滑入、呼吸和闪烁等立绘特效。
- **页面 DIY**：标题页和 CG 画廊可在 Code 页用受限 DSL 调整字体、颜色、透明度、圆角、
  布局与图片适配；标题内容、背景和音乐仍由表单/Blockly 编辑。
- **Player 功能**：手动存读档、快速存读档、快进、CG 画廊、音量与显示设置，以及中英文界面。
- **多种发布目标**：`.vngame` Runtime Bundle、Web Player ZIP 和独立游戏 ZIP。

## 工作流程

```text
表单 / Blockly / Code
      │
      ▼
Editor Renderer ──IPC──> Electron Main ──JSONL──> C++ Core
                                                   │
                                            Author Project v22
                                                   │ compile
                                                   ▼
                                           Runtime Bundle v13
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
                  Desktop Player                                       Web Player
```

Renderer 不接触真实工程路径；文件、媒体和导出操作由受信任的 Electron Main 处理。
Player 只读取经过严格校验的 Runtime Bundle，不加载 Editor 的写入能力。

## 快速开始

### 环境要求

- Node.js 24（仓库提供 [`.node-version`](./.node-version)）
- pnpm 11.18.0
- CMake 3.20+
- 支持 C++20 的编译器
- Git 与网络连接（首次配置 CMake 时会获取固定版本的 `nlohmann/json`）

### 启动 Editor

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/editor start
```

`start` 会先配置并构建 C++ Backend，再准备 Player 模板并启动 Electron Editor。第一次
构建会比之后更久。

如需单独调试 Desktop Player，可运行：

```sh
pnpm --dir apps/player start
```

开发 Player 默认读取仓库中的测试内容包，不会修改 Editor 工程。

## 编辑与导出

一个典型项目流程如下：

1. 新建或打开作者工程，并在独立的“资源管理”工作区导入、搜索、预览和重命名图片、音频与视频，或移除未引用资源。
2. 在标题页、CG 画廊和故事场景之间切换：用表单、Blockly 或 Code 编辑剧情，并用
   Code 调整标题页/CG 画廊样式。
3. 使用静态舞台检查布局，再用正式预览验证选择、逻辑、媒体和 CG 时序。
4. 从 Editor 顶栏选择导出类型并生成成品。

| 导出类型 | 结果 | 使用方式 |
| --- | --- | --- |
| Runtime Bundle | `.vngame` 内容包 | 使用 Desktop Player 打开，或作为后续平台构建输入。 |
| Web Player | `<项目>-Web.zip` | 解压并部署到 HTTP/HTTPS 静态站点；它是 React/DOM/CSS 应用，不是 WebGL 包。 |
| 独立游戏 | 应用 ZIP | 当前本地 Editor 仅在 macOS 生成；Windows/Linux 产物通过对应平台的 CI/发布流程构建。 |

## 仓库结构

| 目录 | 主要内容 |
| --- | --- |
| [`apps/editor/`](./apps/editor/README.md) | Electron Editor、Blockly、表单、预览、资源管理与导出。 |
| [`apps/player/`](./apps/player/README.md) | Desktop/Web Player、安全内容加载、设置与存档。 |
| [`engine/`](./engine/README.md) | C++20 作者模型、JSONL Backend、序列化、迁移和原子命令。 |
| [`packages/runtime/`](./packages/runtime/README.md) | 平台无关的剧情状态机、逻辑执行和 Snapshot。 |
| [`packages/player-ui/`](./packages/player-ui/README.md) | Editor 与 Player 共享的标题页、舞台、CG、选项和存档 UI。 |
| [`examples/`](./examples/README.md) | 可打开的示例作者工程。 |

每个主要源码目录都提供自己的 README，可从上表逐级进入对应实现。CI 与发布配置属于维护
基础设施，不作为项目首页的核心功能入口。

## 数据兼容

| 数据 | 当前写出 | 当前读取 |
| --- | --- | --- |
| Author Project | v22 | v1–v22 |
| Runtime Bundle | v13 | v1–v13 |
| Game Runtime Snapshot | v5 | v1–v5 |

旧版本会在严格校验后迁移；不支持的未来版本、额外字段、失效资源引用或损坏快照会被拒绝，
而不是静默降级。调整这些契约时，需要同步修改 C++ Reader/Writer、Editor Compiler、Player
Schema、共享 Runtime 和兼容性测试。

图片缩放字段在 Author v21 / Runtime v11 / Snapshot v5 引入。Author v1–v20、Runtime
v1–v10 和 Snapshot v1–v4 迁移时统一采用 100%；无背景或清除立绘也必须规范化为 100%。
标题页背景和 CG 不属于本轮缩放契约。Runtime v12 在 `game.defaultLanguage`
中固化导出时 Main 权威 Editor 语言；旧 Runtime v1–v11 迁移为 `zh-CN`。
桌面和 Web Player 只在首次使用或没有持久语言时采用该包默认，玩家已保存的语言优先；
这只影响 Player 外壳，不翻译作者标题、对白、说话人或 Choice。

Author v22 / Runtime v13 为 `startScreen.style` 和 `cgGallery.style` 加入严格类型化页面样式。
旧 Author v1–v21 和 Runtime v1–v12 迁移为安全默认样式。Code 页的 DSL 只解析白名单字段，
不保存或执行任意 CSS、JavaScript、选择器或 URL。

## 开发验证

根目录没有统一的 `package.json` 脚本，请在对应工作区执行命令。常用验证入口如下：

```sh
# C++ Core / Backend
pnpm --dir apps/editor engine:build
pnpm --dir apps/editor engine:test

# Editor Renderer / Main
pnpm --dir apps/editor exec vitest run
pnpm --dir apps/editor lint

# Runtime 行为、共享 UI 与 Player
pnpm --dir packages/runtime exec vitest run
pnpm --dir packages/player-ui typecheck
pnpm --dir apps/player test
pnpm --dir apps/player lint

git diff --check
```

Windows 的 C++ 测试应在构建后使用：

```powershell
ctest --test-dir engine/build -C Debug --output-on-failure
```
