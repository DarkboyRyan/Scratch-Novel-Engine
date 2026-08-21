# Scratch Novel Engine
一个使用 Electron + React 构建编辑器界面、使用 C++20 构建业务核心的视觉小说引擎。

Editor 默认进入软件托管的“主界面”合成场景，可通过表单或固定 Blockly 结构自定义
游戏显示名、背景图片和循环音乐，并在 Editor 内预览完整标题页流程；Player 提供固定的
“开始游戏 / 选项 / 退出游戏”入口。作者可在 Blockly 中主动插入向下开放的“延伸”
页首来拆分长剧情，并通过白色数字字段调整整页先后；表单和运行时仍保持连续剧情语义。当前作者项目格式为 `fileVersion: 13`
（Reader 支持 v1–v13），导出格式为 runtime v4（Player 兼容 v1/v2/v3/v4）。

- [当前架构说明](./docs/architecture.md)
- [独立游戏导出与 Player](./docs/game-export-player.md)
- [技术栈与面试讲解指南](./docs/technical-stack-interview-guide.md)
- [C++ Core 构建与协议](./engine/README.md)

```sh
fnm exec --using=24 pnpm --dir apps/editor start
```

启动命令会先使用 CMake 构建 `engine/` 中的 C++ 后端，再打开 Electron 编辑器。
