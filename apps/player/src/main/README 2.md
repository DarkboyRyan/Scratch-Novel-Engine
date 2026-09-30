# Player Main

[返回 Player Source](../README.md)

Electron 主进程功能按安全边界拆分。

Main 是桌面 Player 唯一拥有 Node.js 文件系统、Electron 原生 API 和 `app.getPath('userData')` 数据目录的进程。它创建隐藏窗口、载入并验证启动内容、绑定每个窗口的内容/存档/设置服务，待持久化显示设置应用完成后才显示窗口。

## 生命周期与数据流

应用启动时，[`main.ts`](../main.ts) 先解析通用、开发夹具或嵌入式内容模式，再创建隔离窗口和自定义媒体服务。每个 `webContents` 都得到独立的 `PlayerBundleSession` 与设置控制器，同时共享按游戏身份隔离的持久化 Store。IPC 注册器依据可信入口 URL 和发送帧查找对应上下文，调用结束前还会确认游戏会话没有被新 Bundle 替换。

媒体不通过 `file://` 暴露。加载器验证资源后，Media Service 为当前 Bundle 生成带代次令牌的 URL；切换游戏或销毁窗口会使旧 URL 失效。退出阶段由设置协调器合并并发退出事件，等待设置落盘后再清理会话。

## 开发约束

Main 返回给 Renderer 的数据必须使用 [`../shared/playerProtocol.ts`](../shared/playerProtocol.ts) 中的公开结构。绝对路径、哈希、文件大小、原始异常和媒体能力令牌都属于 Main 私有信息。新增 IPC 动作时必须同时增加精确字段校验、可信帧校验覆盖和相应单元测试。

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
