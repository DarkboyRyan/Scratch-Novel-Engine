# Player Settings

[返回 Player Main](../README.md)

设置模块同时处理持久数据与桌面原生窗口状态。共享协议定义语言、主/通道音量、窗口模式和尺寸预设；Store 保证文档安全，Manager 串行应用变更并以 BrowserWindow 的真实状态为准。

## 读取和应用流程

`PlayerSettingsStore` 从 `userData/settings` 读取版本化 JSON，主文件失败时尝试备份。没有可恢复文件、主备均损坏和没有语言字段的 V1 设置返回 `default` 语言来源，当前 V2 设置返回 `stored`；旧版数值设置仍会保留。写入会规范化数值、限制大小、拒绝链接目录，并通过临时文件和 rename 更新主文件与备份。

`PlayerSettingsManager` 只初始化一次，并将操作排入同一队列。新窗口先在隐藏状态应用尺寸预设，页面加载后再执行全屏转换，最后才允许显示；这样可避免恢复全屏设置时闪现窗口框。系统原生进入/退出全屏事件会反向同步为权威窗口状态；语言来源仍为 `default` 时只更新内存，避免一次系统窗口事件把静态中文误记成玩家语言。`PlayerSettingsQuitCoordinator` 合并多个退出事件，等待队列刷盘完成后只调用一次真正退出。

界面语言和音量由 Renderer 使用返回设置，窗口几何只能由 Main 修改。Renderer 会在设置来源为 `default` 时采用当前游戏包的默认语言，并在第一次显式设置更新中一并持久化该有效语言；恢复默认也以当前包语言为准。新增设置字段时必须同步协议版本、V1/V2 迁移、Store、Manager 或 Renderer 消费端及测试。

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerSettingsProtocol.test.ts \
  tests/unit/playerSettingsStore.test.ts \
  tests/unit/playerSettingsManager.test.ts \
  tests/unit/playerSettingsQuitCoordinator.test.ts
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerSettingsManager.ts`](./PlayerSettingsManager.ts) | Electron BrowserWindow | 应用设置并协调窗口大小/全屏转换 | `PlayerSettingsManager`、`PLAYER_WINDOW_SIZE_PRESETS` |
| [`PlayerSettingsQuitCoordinator.ts`](./PlayerSettingsQuitCoordinator.ts) | TypeScript | 合并并发退出并等待设置落盘 | `PlayerSettingsQuitCoordinator` |
| [`PlayerSettingsStore.ts`](./PlayerSettingsStore.ts) | Node.js 文件系统 | 原子持久化、备份恢复和旧版迁移 | `PlayerSettingsStore`、`parseDocument` |
