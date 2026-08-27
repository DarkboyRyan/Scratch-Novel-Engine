# Player Settings

[返回 Player Main](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerSettingsManager.ts`](./PlayerSettingsManager.ts) | Electron BrowserWindow | 应用设置并协调窗口大小/全屏转换 | `PlayerSettingsManager`、`PLAYER_WINDOW_SIZE_PRESETS` |
| [`PlayerSettingsQuitCoordinator.ts`](./PlayerSettingsQuitCoordinator.ts) | TypeScript | 合并并发退出并等待设置落盘 | `PlayerSettingsQuitCoordinator` |
| [`PlayerSettingsStore.ts`](./PlayerSettingsStore.ts) | Node.js 文件系统 | 原子持久化、备份恢复和旧版迁移 | `PlayerSettingsStore`、`parseDocument` |
