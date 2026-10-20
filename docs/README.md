# 技术文档

**中文** | [English](./README.en.md)

这里记录跨模块设计和功能实现。建议先了解整体架构与工程存储，再按功能查阅专题；各源码目录的 README 提供本地开发入口和验证命令。

当前数据格式为 Author v22、Runtime v13 和 Snapshot v5；Author 和 Runtime 分别兼容读取 v1–v22 与 v1–v13。迁移规则和具体限制见相关专题。

## 架构与工程

- [整体架构与进程边界](./architecture.md)
- [代码组织、共享包与依赖方向](./code-organization-and-decoupling.md)
- [工程目录、媒体资源与安全读写](./project-folder-storage.md)
- [技术栈与设计取舍说明](./technical-stack-interview-guide.md)

## 创作与剧情

- [撤销、重做、保存点与崩溃恢复](./editor-history-and-recovery.md)
- [正式预览与剧情运行](./game-preview-runtime.md)
- [代码编辑、页面样式与受限 DSL](./code-section-technical-stack.md)
- [变量、条件与循环积木](./logic-blockly-implementation.md)
- [剧情内 CG 展示与时序](./cg-display-blockly-implementation.md)
- [CG 画廊、分页与大图查看](./cg-gallery-implementation.md)
- [人物立绘与剧情图片缩放](./character-portrait-implementation.md)
- [人物立绘特效](./character-portrait-effects.md)
- [选择分支](./choice-branch-implementation.md)
- [场景跳转](./scene-jump-implementation.md)
- [语音与背景音乐](./audio-implementation.md)
- [视频播放](./video-playback-block.md)

## 播放器与发布

- [桌面内容包与独立游戏导出](./game-export-player.md)
- [Web 播放器导出与部署](./web-player-export.md)
- [存读档与快照](./save-load-implementation.md)
- [播放器语言、音量与显示设置](./player-options-implementation.md)
- [编辑器语言、主题与设置同步](./editor-localization-implementation.md)
- [编辑器安装包构建与发布](./editor-release.md)

## 维护约定

- 产品名称统一使用 Scratch Novel Engine；代码中的 `@vnengine/*`、`window.vnEngine`、`vn_engine_*`、`vn-engine-*`、`.vnengine` 及 `VN Engine Player` 等兼容标识保持原样。
- 代码、协议和安全边界变化时，同步更新文档；明确区分当前格式与历史版本。
- 使用相对链接，避免引用本机路径和构建产物；删除重复副本，保留专题中的独有说明。

[返回项目首页](../README.md)
