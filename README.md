# Scratch Novel Engine

Scratch Novel Engine 是一套面向视觉小说创作与发行的桌面工具链。作者可以在 Electron
编辑器中用表单或 Blockly 组织剧情、逻辑、媒体与人物演出，再将同一份工程导出为桌面
Player 内容包或可直接部署的 Web Player。项目使用 C++20 核心维护权威作者数据，使用
平台无关的 TypeScript Runtime 执行剧情，因此 Editor 预览、桌面 Player 与浏览器 Player
遵循同一套播放语义。

目前已覆盖场景与对白、背景/立绘/语音/BGM/视频、选择分支、变量、If/Else、固定次数
Repeat、CG 画廊、剧情内 CG 展示、人物特效、保存读取、快进、中英界面和显示/音量设置。

## 架构概览

创作与运行数据沿单向边界流动：

```text
Editor Renderer → Electron Main → C++ JSONL Backend → C++ Core
        │                                      │
        └──── Author v20 project ──────────────┘
                         ↓ compile/export
                  Runtime v10 content bundle
                         ↓
          Shared Runtime + Player UI → Desktop / Web Player
```

C++ Core 负责项目模型、聚合校验和原子编辑；Electron Main 负责受信任的文件与媒体访问；
Renderer 不接触真实存储路径。共享 Runtime 只处理纯数据状态，Player UI 负责展示，因此两者
都不依赖编辑器写权限。

## 工程导航

每个目录的 README 都会说明它在架构中的位置、主要工作流、验证方式和文件职责。

| 目录 | 技术 | 主要职责 |
| --- | --- | --- |
| [`apps/`](./apps/README.md) | Electron、React、Blockly、Vite | Editor 与 Desktop/Web Player 应用。 |
| [`packages/`](./packages/README.md) | TypeScript、React | 跨应用复用的 Runtime 与 Player UI。 |
| [`engine/`](./engine/README.md) | C++20、CMake、JSONL | 权威作者模型、原子命令、序列化与安全媒体导入。 |
| [`examples/`](./examples/README.md) | Author JSON | 可打开的兼容性示例工程。 |
| [`.github/`](./.github/README.md) | GitHub Actions | 跨平台质量门禁、签名构建与正式发布自动化。 |

根目录不展开内部设计文档；需要深入实现时，请从相应源码目录的 README 逐级进入。

## 当前格式契约

| 契约 | 当前写出 | 兼容读取 | 关键约束 |
| --- | --- | --- | --- |
| Author Project | v20 | v1–v20 | `startScreen.eyebrow` 是可编辑标题上方文字；默认 `A VN ENGINE STORY`，空字符串会隐藏该行。 |
| Runtime Bundle | v10 | v1–v10 | 当前版本携带 `startScreen.eyebrow`；Player 先严格校验内容包，再交给共享 Runtime。 |
| Game Runtime Snapshot | v4 | v1–v4 | 保存变量、循环栈、CG 状态、人物最终透明度和单调特效序号；读档不重播瞬时特效。 |

标题上方文字保存前会去除首尾 ASCII 空白，最多占 256 个 UTF-8 字节且不能包含 NUL。
Author v18 / Runtime v9 是人物特效的历史里程碑；Author v19 随后加入人物节点
`mode: "show" | "clear"`，这些旧格式仍由当前 Reader 严格迁移。

逻辑节点保存为受限数据结构，不执行任意脚本。If/Else、Repeat 与剧情内 CG 都使用严格配对的
扁平控制标记；CG 范围内只能包含对白，图片显示后可等待 0–60 秒再出现第一句对白。CG
画廊则是独立的项目级数据：至少一页，每页固定九个可空图片槽，非空图片不能跨页重复。

## 快速开始

开发环境需要 Node.js 24、pnpm、CMake 3.20+ 和支持 C++20 的编译器。首次安装依赖后启动
Editor；启动脚本会配置并构建 C++ Backend，再打开 Electron 窗口。

```sh
fnm exec --using=24 pnpm install
fnm exec --using=24 pnpm --dir apps/editor start
```

首次配置 C++ 工程时，CMake 会获取固定版本的 `nlohmann/json`。Player 可单独启动：

```sh
fnm exec --using=24 pnpm --dir apps/player start
```

## 开发与验证

修改所在模块后至少运行对应的类型检查、测试和 lint。Editor 测试会同时构建并执行 C++
测试；Runtime 和 Player UI 可以独立验证。

```sh
pnpm --dir packages/runtime test
pnpm --dir packages/player-ui typecheck

pnpm --dir apps/player typecheck
pnpm --dir apps/player lint
pnpm --dir apps/player test

pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
pnpm --dir apps/editor test
```

版本字段、序列化迁移与 Runtime/Snapshot 结构属于跨模块契约。调整它们时，应同步更新 C++
Reader/Writer、导出编译器、Player schema、共享 Runtime、兼容测试和相关 README。
