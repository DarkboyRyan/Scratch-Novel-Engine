# Player Source

[返回 Player](../README.md)

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `main` | Electron Main、Node.js | 窗口、内容、媒体、存档、设置与 IPC | [查看](./main/README.md) |
| `renderer` | React、TypeScript、CSS | 桌面 Player 用户界面与游戏交互 | [查看](./renderer/README.md) |
| `shared` | TypeScript | 跨进程协议、媒体契约与运行包解析 | [查看](./shared/README.md) |
| `web` | React、Fetch、IndexedDB | 浏览器版 Player 宿主实现 | [查看](./web/README.md) |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`main.ts`](./main.ts) | Electron Main | 组装应用生命周期和服务 | `openPlayerWindow`、IPC/协议注册、退出刷盘 |
| [`preload.ts`](./preload.ts) | Electron Preload | 暴露最小 Player API | `invokePlayer`、`contextBridge.exposeInMainWorld` |
