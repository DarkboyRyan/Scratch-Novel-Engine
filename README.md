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
和 Esc 返回。作者可在 Blockly 中主动插入向下开放的“延伸”页首来拆分长剧情，并通过
白色数字字段调整整页先后；表单和运行时仍保持连续剧情语义。当前作者项目格式为
`fileVersion: 16`（Reader 支持 v1–v16），导出格式为 runtime v7（Player 兼容 v1–v7）。
剧情 Blockly 还提供变量 Set/Change、可嵌套的 If/Else 和固定次数 Repeat；工具箱按剧情、
逻辑、变量、音乐和图片分类。游戏进度使用可恢复变量与循环栈的 `GameRuntimeSnapshot v2`。
除 `.vngame` 与 macOS 独立应用外，Editor 也可生成根目录含 `index.html` 的
`*-Web.zip`，用于部署浏览器版 HTML5 Player。

- [当前架构说明](./docs/architecture.md)
- [独立游戏导出与 Player](./docs/game-export-player.md)
- [Web Player ZIP 导出](./docs/web-player-export.md)
- [Player 保存与读取](./docs/save-load-implementation.md)
- [Player 选项系统](./docs/player-options-implementation.md)
- [逻辑 Blockly](./docs/logic-blockly-implementation.md)
- [Editor 中英文切换](./docs/editor-localization-implementation.md)
- [技术栈与面试讲解指南](./docs/technical-stack-interview-guide.md)
- [C++ Core 构建与协议](./engine/README.md)

```sh
fnm exec --using=24 pnpm --dir apps/editor start
```

启动命令会先使用 CMake 构建 `engine/` 中的 C++ 后端，再打开 Electron 编辑器。
