# Player Main

[中文](./README.md) | [English](./README.en.md)

[返回 Player Source](../README.md)

Main 管理桌面 Player 的文件、窗口、媒体、存档和设置。窗口先隐藏创建，完成启动内容验证与显示设置恢复后再显示。

`main.ts` 为每个 `webContents` 绑定独立内容会话和设置控制器，持久存储按游戏身份隔离。IPC 先验证入口 URL 和发送帧，再分派请求；异步操作也需检查游戏会话是否已被替换。

媒体通过带会话代次和令牌的 URL 提供，切换游戏或销毁窗口后失效。退出时先等待设置写入，再清理会话。返回界面的数据必须遵循公开协议，不能暴露绝对路径、哈希、内部异常或原始能力令牌。

## 目录

- [`build`](./build/README.md)
- [`content`](./content/README.md)
- [`ipc`](./ipc/README.md)
- [`media`](./media/README.md)
- [`save`](./save/README.md)
- [`security`](./security/README.md)
- [`settings`](./settings/README.md)
- [`window`](./window/README.md)

## 主要文件

- [`createPlayerWindow.ts`](./createPlayerWindow.ts)
