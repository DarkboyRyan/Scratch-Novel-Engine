# Scratch Novel Engine
一个使用 Electron + React 构建编辑器界面、使用 C++20 构建业务核心的视觉小说引擎。

Editor 默认进入软件托管的“主界面”合成场景，可通过表单或固定 Blockly 结构自定义
游戏显示名、背景图片和循环音乐，并在 Editor 内预览完整标题页流程；正式 Player 提供固定的
“开始游戏 / 读取游戏 / CG 画廊 / 选项 / 退出游戏”入口，以及 3 个手动存档槽、
独立快速槽和游戏内操作栏；选项可持久切换简体中文 / English 界面、四路音量与显示模式。
Player 的小/中/大窗口预设还会同步调整整套界面字号。Editor 顶栏“导出”旁也提供独立
“设置”，可持久切换 Editor 自身的中文 / English 界面并同步所有 Editor 窗口；作者文本保持原文。
CG 画廊是独立的软件托管编辑场景：
表单可手动新增/删除页面，Blockly 从工具箱拖入一个大模块来新增页面；每页固定保留
九个图片槽位，白色下拉框的“无”表示空槽。Player 原样显示九格并支持分页、点击放大
和 Esc 返回。人物立绘右侧还可连接震动、跳跃、呼吸、闪烁、淡入、淡出或滑入特效；
正式预览和 Desktop/Web Player 共享动画、暂停与 reduced-motion 语义。作者可在 Blockly 中
主动插入向下开放的“延伸”页首来拆分长剧情，并通过
白色数字字段调整整页先后；表单和运行时仍保持连续剧情语义。当前作者项目格式为
`fileVersion: 19`（Reader 支持 v1–v19），导出格式为 runtime v9（Player 兼容 v1–v9）。
Author v19 用人物节点的 `mode: "show" | "clear"` 区分“显示立绘”和“明确清除”：
`show + assetId:null` 是尚未选图的编辑占位，预览按 no-op 处理且导出会明确拒绝；只有
`clear` 才清除人物层，并要求 `assetId`、`position` 与 `effect` 都为 `null`。
剧情 Blockly 还提供变量 Set/Change、可嵌套的 If/Else 和固定次数 Repeat；工具箱按剧情、
逻辑、变量、音乐、图片和特效分类。“图片”中另有可嵌入对白的 C 形“显示 CG”，支持对白出现前
0–60 秒的可暂停展示时长。游戏进度使用可恢复变量、循环栈、CG 状态和人物最终透明度的
`GameRuntimeSnapshot v4`；快照保存全局单调特效序号和人物最终透明度，读档不重播瞬时
动画。Author v17 / Runtime v8 / Snapshot v3 保留为显示 CG 的历史里程碑。
除 `.vngame` 与 macOS 独立应用外，Editor 也可生成根目录含 `index.html` 的
`*-Web.zip`，用于部署浏览器版 HTML5 Player。

## 工程导航

模块文档与源码放在同一目录，README 只描述其直接职责并继续链接到下一层，便于从架构逐级定位实现。

| 模块 | 核心技术 | 职责 | 入口 |
| --- | --- | --- | --- |
| Editor | Electron、React、Blockly、TypeScript | 创作项目、资源管理、图形化编辑、预览与导出。 | [`apps/editor/`](./apps/editor/README.md) |
| Player | Electron、React、HTML5 | 桌面/Web 运行、存读档、设置和媒体播放。 | [`apps/player/`](./apps/player/README.md) |
| C++ Engine | C++20、CMake、JSONL | Author 权威模型、原子业务命令、序列化和安全资源导入。 | [`engine/`](./engine/README.md) |
| Player UI | React、CSS | Editor 预览与正式 Player 共用的视觉组件。 | [`packages/player-ui/`](./packages/player-ui/README.md) |
| Runtime | TypeScript 状态机 | 剧情执行、逻辑变量、CG、人物特效和存档快照。 | [`packages/runtime/`](./packages/runtime/README.md) |
| 示例项目 | Author JSON | 可直接打开的最小项目与格式参考。 | [`examples/`](./examples/README.md) |

## 快速开始

```sh
fnm exec --using=24 pnpm --dir apps/editor start
```

启动命令会先使用 CMake 构建 `engine/` 中的 C++ 后端，再打开 Electron 编辑器。
