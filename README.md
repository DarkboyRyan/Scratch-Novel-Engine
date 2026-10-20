# Scratch Novel Engine

**中文** | [English](./README.en.md)

Scratch Novel Engine 是一款视觉小说创作工具，支持通过表单、Blockly 积木和代码编辑剧情，并预览和导出游戏。项目基于 C++20、TypeScript、React 和 Electron 构建。

> **项目进展：正在等待教授反馈，后续将根据反馈继续修改。**

## 主要功能

- 编写对白、设置分支与变量、安排场景跳转，管理图片、音频和视频资源。
- 预览剧情，调整标题页、人物演出和 CG 画廊。
- 支持撤销、重做和崩溃恢复。
- 导出桌面播放器内容包、Web 播放器或独立游戏。
- 编辑器和播放器均支持中英文界面。

## 快速开始

需要 Node.js 24、pnpm 11.18.0、CMake 3.20+ 和支持 C++20 的编译器。首次构建需联网获取依赖。

在项目根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/editor start
```

启动时会构建 C++ 后端、准备播放器模板并打开编辑器，首次启动需要较长时间。

## 文档与源码

| 入口 | 内容 |
| --- | --- |
| [Editor](./apps/editor/README.md) | 编辑器开发与验证 |
| [Player](./apps/player/README.md) | 桌面与 Web 播放器 |
| [C++ Core](./engine/README.md) | 创作工程、数据校验与后端 |
| [Runtime](./packages/runtime/README.md) / [共享 UI](./packages/player-ui/README.md) | 剧情执行与播放器界面 |
| [示例工程](./examples/README.md) | 示例创作工程 |
| [技术文档](./docs/README.md) | 架构、数据格式与功能实现 |
| [Editor 发布](./docs/editor-release.md) | 安装包构建与发布 |

编辑器首次启动时默认使用英文，可在 Settings（设置）中切换为中文，语言偏好会自动保存。模块 README 提供中英文版本，详细技术专题目前以中文为主。
