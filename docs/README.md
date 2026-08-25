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
- [独立游戏 Player 与导出流程](./game-export-player.md)：记录已完成的共享 Runtime 与
  Player、v15→runtime v6 内容包、runtime v1–v6 兼容读取、macOS `*-macOS.zip`
  独立应用导出（ZIP 内含唯一
  已签名 `.app`）、embedded 模式和多平台
  workflow；也列出 `player-release`/`game-release` protected Environments、不可变 tag/
  Release 和 Environment Secrets 的上线配置，并区分“流水线已实现”与“正式发行尚未验收”。
- [Player 保存与读取](./save-load-implementation.md)：3 个手动槽和独立快速槽、
  `GameRuntimeSnapshot v1`、Main-owned 游戏身份、原子本地存储、标题页读取入口与
  游戏内底栏，以及完整实现流程和技术栈。
- [Player 选项系统](./player-options-implementation.md)：`PlayerSettingsV1`、四通道音量、
  窗口/全屏与三档尺寸、userData 原子设置文件、trusted-frame patch IPC、媒体生命周期、
  启动 activation gate、纯音量 patch 不改窗口、CG/存档/选项焦点互斥、Editor 内存预览
  和可复现测试矩阵。

### 剧情与编辑器功能

- [当前架构中的主界面合成场景](./architecture.md#81-软件托管的主界面合成场景)：
  Editor 默认进入的表单/Blockly 双编辑主界面、完整标题页预览、
  `project.startScreen` 和 Player 标题页。
- [当前架构中的 CG 画廊合成场景](./architecture.md#82-软件托管的-cg-画廊合成场景)：
  独立表单/Blockly 编辑入口、手动页面、每页固定九槽、Player 分页与大图浏览，以及
  `project.cgGallery.pages[].imageAssetIds` 的结构与全局唯一引用契约。
- [CG 画廊实现](./cg-gallery-implementation.md)：CG 数据模型、表单与 Blockly 页模块、
  Player 九宫格/大图交互、版本迁移和导出资源闭包。

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
   总技术栈、六条调用链和常见问答。
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
    Runtime、独立 Player、内容包、Player 模板、平台桌面应用及正式发布门禁之间的
    关系。
12. [Player 保存与读取](./save-load-implementation.md)：理解为什么只传版本化小快照、
    如何按游戏身份隔离存档，以及 React、Preload、Main 和原子文件事务的完整调用链。
13. [Player 选项系统](./player-options-implementation.md)：理解为什么 Renderer 只发送
    exact patch、Main 如何同步原生全屏与 workArea，以及音量调整如何不重置播放位置。

## 当前真实技术栈

Electron 43、React 19、TypeScript 5.9、Blockly 13、Vite 5、Electron Forge 7、
C++20、CMake、nlohmann/json、Vitest、Node Test、CTest 和 GitHub Actions。

当前项目 Writer 固定写 `fileVersion: 15`，Reader 支持 v1–v15。v10 新增项目级
`project.startScreen` 背景/音乐配置，v11 新增与项目名彼此独立的主界面显示标题；
它不是 Scene。v12 新增作者可从 Toolbox 主动插入的“延伸”节点，用于在 Blockly
中建立向下连接的新分页；白色数字字段会原子调整整页先后。v13 为人物节点新增可空
百分比坐标；v14 首次以扁平 `project.cgGallery.imageAssetIds` 加入 CG 画廊。v15 改为
至少一项的 `pages`，每页精确保存九个 `string | null` 槽位，所有非空图片 ID 跨页唯一；
旧 v14 会按顺序每九张分块并补 `null`，v1–v13 迁移为一张全空页面。表单会隐藏延伸节点，
Compiler 会在生成 Runtime 前剥离它。可运行的
`SceneNode` 仍是 Dialogue、Background、Character、SceneJump、Bgm、Video 和 Choice
七种类型；`ChoiceOption` 是 ChoiceNode 内部的子实体。

`archive/` 中的历史文档可能出现 PixiJS、Zod、Zustand、Playwright 或 Web 导出等
尚未采用的技术。面试时不要把历史计划当作当前实现。
