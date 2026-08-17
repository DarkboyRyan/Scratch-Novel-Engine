# VN Engine 文档索引

本文只负责按主题导航，文档仍保留在当前路径，没有因为分类而移动文件。

## 按主题查找

### 总览与面试

- [当前架构](./architecture.md)：Renderer、Preload、Electron Main、C++ Backend、
  C++ Core 与文件系统之间的职责和调用关系。
- [代码结构整理与解耦](./code-organization-and-decoupling.md)：共享 Runtime、Player UI、
  application ports、Main/C++ 媒体拆分和导出前的依赖边界。
- [技术栈与面试讲解指南](./technical-stack-interview-guide.md)：项目介绍模板、技术栈、
  关键调用链和常见面试问题。

### 项目、存储与导出

- [项目文件夹与媒体资源](./project-folder-storage.md)：项目目录格式、安全保存、资源导入、
  capability URL 与媒体读取。
- [独立游戏 Player 与导出流程](./game-export-player.md)：解释为什么编辑器预览不能直接作为
  最终游戏，以及共享 Runtime、独立 Player、游戏内容包和桌面游戏打包的开发路线。

### 剧情与编辑器功能

- [人物立绘](./character-portrait-implementation.md)：人物资源、时间线节点、layer 和预览状态。
- [场景跳转](./scene-jump-implementation.md)：SceneJumpNode 如何贯穿 C++、IPC、React、
  Blockly 和正式预览。
- [选项分支](./choice-branch-implementation.md)：ChoiceNode、嵌套 ChoiceOption、Blockly
  容器和 Galgame 选择界面。

### 运行时与媒体

- [游戏顺序预览](./game-preview-runtime.md)：正式预览的纯状态机、输入规则和运行会话。
- [语音与背景音乐](./audio-implementation.md)：对白语音、BGM 时间线节点、安全导入与播放。
- [视频播放积木](./video-playback-block.md)：阻塞式 VideoNode、Enter 跳过和 Range 请求。

### 历史归档

未来不再代表当前实现的计划或设计文档统一放入 `docs/archive/`。归档文档只用于理解
设计演进，不作为当前功能、版本或技术栈的依据。

## 面试准备推荐顺序

1. [技术栈与面试讲解指南](./technical-stack-interview-guide.md)：先掌握 30 秒介绍、
   总技术栈、四条调用链和常见问答。
2. [当前架构](./architecture.md)：理解 Renderer、Preload、Main、C++ 和文件系统
   的职责边界。
3. [代码结构整理与解耦](./code-organization-and-decoupling.md)：理解如何把现有编辑器
   拆成可被独立 Player 复用、但不泄露编辑权限的模块。
4. [项目文件夹与媒体资源](./project-folder-storage.md)：重点准备安全保存、路径隔离、
   图片/视频/音频导入与 capability 媒体读取。
5. [人物立绘](./character-portrait-implementation.md)：重点准备 Asset/Node/PreviewState
   三层分离和人物 layer。
6. [游戏顺序预览](./game-preview-runtime.md)：重点准备纯状态机和临时运行会话。
7. [场景跳转](./scene-jump-implementation.md)：用作“一个功能如何贯穿全栈”的深挖案例。
8. [语音与背景音乐](./audio-implementation.md)：音频导入、Dialogue 语音、BGM 时间线节点与安全播放。
9. [视频播放积木](./video-playback-block.md)：Blockly 视频节点、阻塞式正式预览和安全 Range 播放。
10. [选项分支](./choice-branch-implementation.md)：ChoiceNode 数据模型、Blockly 嵌套选项和正式预览分支。
11. [独立游戏 Player 与导出流程](./game-export-player.md)：最后理解编辑器预览、共享
    Runtime、独立 Player、内容包和平台桌面应用之间的关系。

## 当前真实技术栈

Electron 43、React 19、TypeScript 5.9、Blockly 13、Vite 5、Electron Forge 7、
C++20、CMake、nlohmann/json、Vitest 和 CTest。

当前项目 Writer 固定写 `fileVersion: 9`，Reader 支持 v1–v9。`SceneNode` 目前有
Dialogue、Background、Character、SceneJump、Bgm、Video 和 Choice 七种类型；
`ChoiceOption` 是 ChoiceNode 内部的子实体，不是第八种 SceneNode。

`archive/` 中的历史文档可能出现 PixiJS、Zod、Zustand、Playwright 或 Web 导出等
尚未采用的技术。面试时不要把历史计划当作当前实现。
