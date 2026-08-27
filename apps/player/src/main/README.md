# Player Main

[返回 Player Source](../README.md)

Electron 主进程功能按安全边界拆分。

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `build` | TypeScript、Electron Forge | 单游戏构建参数与嵌入资源校验 | [查看](./build/README.md) |
| `content` | Node.js 文件系统 | 游戏包选择、安全读取与会话 | [查看](./content/README.md) |
| `ipc` | Electron IPC | 可信调用验证和功能分派 | [查看](./ipc/README.md) |
| `media` | Electron Protocol、Streams | 受控媒体读取和 Range 响应 | [查看](./media/README.md) |
| `save` | Node.js 文件系统 | 原子存档持久化 | [查看](./save/README.md) |
| `security` | Electron WebFrame | 发送帧信任校验 | [查看](./security/README.md) |
| `settings` | Electron BrowserWindow | 设置存储与窗口状态协调 | [查看](./settings/README.md) |
| `window` | TypeScript | 窗口级服务上下文 | [查看](./window/README.md) |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`createPlayerWindow.ts`](./createPlayerWindow.ts) | Electron | 创建安全隔离窗口并解析入口 | `resolvePlayerEntryUrl`、`createPlayerWindow` |
