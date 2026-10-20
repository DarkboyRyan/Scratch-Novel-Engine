# Player Window

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

窗口上下文将 IPC 请求绑定到对应的内容会话、存档和设置控制器，以 `webContents.id` 为索引，在窗口创建时登记、销毁时移除。

内容会话和设置控制器按窗口隔离，底层持久存储可以共享。新增窗口级服务时，同步创建、销毁和 IPC 测试；不要依赖全局“当前窗口”，或将页面可伪造的标识作为索引。

## 主要文件

- [`PlayerWindowContext.ts`](./PlayerWindowContext.ts)
