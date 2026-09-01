<!-- 文件职责：作为内部技术文档入口；关键内容：当前架构、编辑能力、运行时、存储与发布文档导航。 -->

# VN Engine 内部技术文档

[返回项目首页](../README.md)

`docs/` 记录跨模块设计、格式迁移、安全边界和完整功能链路。它面向需要理解“一个功能如何
贯穿 Editor、C++、Runtime 与 Player”的开发者；各源码目录 README 仍负责本目录的日常入口、
文件职责和验证命令，两者互相补充而不重复。

当前实现基线为 Author v21、Runtime v12 和 Snapshot v5。Author/Runtime Reader 分别兼容
v1–v21 与 v1–v12。Runtime v11 是剧情图片缩放的历史里程碑；缩放覆盖场景初始
背景、时间线背景与人物立绘，使用 10%–300% 整数且默认 100%。Runtime v12
用 `game.defaultLanguage` 记录导出时 Main 权威 Editor 语言，旧 v1–v11 迁移为
`zh-CN`；玩家已持久语言优先，作者文本不翻译。标题页背景和 CG 不在该缩放范围。源码与自动测试是最终事实来源；
文档若与实现不一致，应在同一个改动中更新，而不是保留两套当前说法。

## 推荐阅读顺序

1. 先阅读 [当前架构](./architecture.md)，建立 Renderer、Preload、Main、C++ 与共享包边界。
2. 再阅读 [代码组织与解耦](./code-organization-and-decoupling.md) 和
   [项目文件夹与媒体资源](./project-folder-storage.md)，理解依赖方向与存储安全。
3. 按正在修改的功能选择下方专题，沿 Author → Compiler → Runtime → Player 链路检查。
4. 准备发布时阅读桌面与 Web 导出文档，并执行应用 README 中列出的验证命令。

## 架构、存储与工程说明

| 文档 | 适用场景 | 主要内容 |
| --- | --- | --- |
| [`architecture.md`](./architecture.md) | 了解全局调用链 | Renderer、Preload、Main、C++ Core/Backend、Runtime 与存储边界 |
| [`code-organization-and-decoupling.md`](./code-organization-and-decoupling.md) | 调整模块或依赖 | Shared packages、application ports、Main 服务和单向依赖 |
| [`project-folder-storage.md`](./project-folder-storage.md) | 修改打开、保存或资源 | 项目目录、原子保存、安全导入和 capability URL |
| [`technical-stack-interview-guide.md`](./technical-stack-interview-guide.md) | 快速讲解工程 | 当前技术栈、关键调用链、设计取舍和常见问答 |

## 创作与剧情功能

| 文档 | 适用场景 | 当前关键合同 |
| --- | --- | --- |
| [`game-preview-runtime.md`](./game-preview-runtime.md) | 修改 Editor 正式预览 | 输入、媒体、选择、跳转与纯状态机 |
| [`logic-blockly-implementation.md`](./logic-blockly-implementation.md) | 修改变量或控制积木 | Set/Change、If/Else、Repeat、配对标记、预算和快照 |
| [`cg-display-blockly-implementation.md`](./cg-display-blockly-implementation.md) | 修改剧情内 CG | 对白专用 C 形 body、0–60 秒 lead-in、暂停和读档 |
| [`cg-gallery-implementation.md`](./cg-gallery-implementation.md) | 修改项目级 CG 画廊 | 至少一页、每页九槽、跨页唯一、分页与大图 |
| [`character-portrait-implementation.md`](./character-portrait-implementation.md) | 修改人物立绘或剧情图片缩放 | Author v19 `show/clear` 与 v21 缩放契约、待选图占位、层级和预览 |
| [`character-portrait-effects.md`](./character-portrait-effects.md) | 修改人物特效 | Author v18 / Runtime v9 历史里程碑、七类 sidecar 特效、暂停和 Snapshot v4 |
| [`choice-branch-implementation.md`](./choice-branch-implementation.md) | 修改选项分支 | Choice/Option 稳定 ID、场景目标、Blockly 与 Player UI |
| [`scene-jump-implementation.md`](./scene-jump-implementation.md) | 修改显式跳转 | Author、IPC、投影与 Runtime 跳转语义 |
| [`audio-implementation.md`](./audio-implementation.md) | 修改语音或 BGM | 导入、节点、预览、循环与音量通道 |
| [`video-playback-block.md`](./video-playback-block.md) | 修改阻塞视频 | 资源校验、Range、播放完成、跳过与预览 |

## Player、设置与发布

| 文档 | 适用场景 | 主要内容 |
| --- | --- | --- |
| [`game-export-player.md`](./game-export-player.md) | 修改桌面内容包或发布 | Runtime v12 Bundle、默认语言、模板、签名、公证和 CI 门禁 |
| [`web-player-export.md`](./web-player-export.md) | 修改 WebGL/Web Player ZIP | Runtime v12 包语言、Vite 模板、WebGateway、IndexedDB、ZIP 事务和部署限制 |
| [`save-load-implementation.md`](./save-load-implementation.md) | 修改保存读取 | 三个手动槽、快速槽、Snapshot v5、游戏身份隔离和原子存储 |
| [`player-options-implementation.md`](./player-options-implementation.md) | 修改 Player 选项 | 包默认/玩家持久语言优先级、四路音量、窗口/全屏、三档尺寸和设置迁移 |
| [`editor-localization-implementation.md`](./editor-localization-implementation.md) | 修改 Editor 语言 | typed catalog、Main 持久化、Runtime v12 导出默认、多窗口同步和 Blockly 标签 |

## 文档维护约定

- 专题描述当前实现时，明确标出 Author、Runtime 与 Snapshot 版本，不把历史里程碑写成现状。
- 代码、协议或安全策略变化时，同步更新相应目录 README、专题文档和自动测试。
- 链接使用相对路径；不要链接构建目录、生成产物或本机路径。
- 未来失效的设计稿移入 `archive/` 并标明历史背景；归档内容不作为当前技术栈依据。
