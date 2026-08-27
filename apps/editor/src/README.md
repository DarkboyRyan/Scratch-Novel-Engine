# Editor 源码

该目录按 Electron 进程边界组织，主机权限、桥接契约与界面实现相互隔离。

## 目录

| 目录 | 框架技术 | 主要作用 |
| --- | --- | --- |
| [`main/`](./main/README.md) | Electron Main、Node.js | 管理窗口、后端、文件系统、媒体和导出。 |
| [`renderer/`](./renderer/README.md) | React、Blockly | 提供项目编辑、资源管理和游戏预览界面。 |
| [`shared/`](./shared/README.md) | TypeScript | 定义跨进程 DTO、IPC 通道和全局 API。 |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`main.ts`](./main.ts) | Electron Main | 启动应用并组装窗口级服务。 | 生命周期监听、IPC 注册、设置加载与菜单安装。 |
| [`preload.ts`](./preload.ts) | Electron contextBridge | 向 Renderer 暴露最小类型化 API。 | 包装 `ipcRenderer.invoke/on`，不泄露 Node 能力。 |
