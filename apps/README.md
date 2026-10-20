# 应用程序

**中文** | [English](./README.en.md)

`apps/` 包含面向创作者的编辑器和面向玩家的播放器。两者共享剧情运行时与界面组件，但分别维护 Electron 主进程、进程通信和发布流程。

| 应用 | 用途 |
| --- | --- |
| [Editor](./editor/README.md) | 编辑剧情、管理资源、预览并导出游戏 |
| [Player](./player/README.md) | 运行导出的游戏，提供存读档、CG 画廊和播放设置 |

## 工作流程

1. 编辑器创建或打开创作工程，由 C++ 后端校验并维护工程状态。
2. 表单、Blockly 和代码编辑通过受限的进程通信提交修改，正式预览使用共享运行时。
3. 导出器将创作工程编译为运行内容包，校验资源并记录页面样式和默认界面语言。
4. 桌面或 Web 播放器加载内容包，运行剧情并保存玩家设置与存档。

## 开发与验证

在项目根目录执行所需应用的命令：

```sh
pnpm --dir apps/editor start
pnpm --dir apps/editor typecheck
pnpm --dir apps/editor lint
pnpm --dir apps/editor test

pnpm --dir apps/player start
pnpm --dir apps/player typecheck
pnpm --dir apps/player lint
pnpm --dir apps/player test
```

跨应用的剧情与显示改动，还需验证 [Runtime](../packages/runtime/README.md) 和[共享 UI](../packages/player-ui/README.md)。架构与数据格式见[技术文档](../docs/README.md)。

[返回项目首页](../README.md)
