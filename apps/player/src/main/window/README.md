# Player Window

[返回 Player Main](../README.md)

窗口上下文把一次 IPC 请求绑定到正确的内容会话、存档 Store 和设置控制器。Map 的 key 是 Electron `webContents.id`，由 [`../../main.ts`](../../main.ts) 在窗口创建时登记、在 `webContents` 销毁时移除。

上下文本身不实现业务逻辑；它让 IPC 分派器无需依赖全局“当前窗口”，并确保多窗口或窗口重建时不会把 A 窗口的 Bundle 与 B 窗口的设置控制器混用。内容会话和设置控制器按窗口隔离，底层持久 Store 可以安全共享并自行按游戏身份或全局设置组织数据。

新增窗口级服务时，应先确认它确实需要随窗口生命周期存在，再扩展 `PlayerWindowContext` 并在创建、销毁和 IPC 测试中一起接线。不要在 Map 中保存 Renderer 对象或可被页面伪造的标识。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerWindowContext.ts`](./PlayerWindowContext.ts) | TypeScript | 绑定窗口与内容、存档、设置服务 | `PlayerWindowContext`、`PlayerWindowContexts` |
