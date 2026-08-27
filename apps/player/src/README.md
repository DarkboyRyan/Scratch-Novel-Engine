# Player Source

[返回 Player](../README.md)

Player 源码以“共享协议 + 可替换宿主”组织。桌面入口使用 Electron Main/Preload 承接系统能力，Web 入口使用浏览器 API；二者最终把同一种 `PlayerGateway` 交给 Renderer，因此标题页、剧情播放、存读档和选项界面无需维护两套业务逻辑。

## 运行边界

桌面请求从 Renderer 发往 Preload，再以单一 IPC 通道进入 Main。Main 会校验发送帧、调用字段和当前窗口会话，之后才允许读取游戏、解析媒体、访问存档或修改窗口。Web 没有 IPC，而是在页面内实现同一端口；运行包仍需经过共享 Schema 严格解析，存储则隔离在 IndexedDB。

[`shared`](./shared/README.md) 只能包含各环境都能安全导入的类型、守卫与纯解析逻辑，不能依赖 Electron、Node 文件系统或 DOM。Renderer 也不应直接判断当前运行在桌面还是 Web，差异通过 Gateway 的能力字段和结果类型表达。

## 入口职责

[`main.ts`](./main.ts) 组装桌面应用生命周期、每窗口服务和退出刷盘；[`preload.ts`](./preload.ts) 将白名单 API 暴露为 `window.vnPlayer`。桌面 Renderer 由 [`renderer/index.tsx`](./renderer/index.tsx) 启动，Web 则有独立的 [`web/index.tsx`](./web/index.tsx)，两者都渲染同一个 `App`。

修改跨层接口时，需要同步更新共享协议、Main IPC 校验、Preload 映射、Gateway 和测试。新增系统权限默认留在 Main 或浏览器宿主，不要扩大 `window.vnPlayer` 或把内部错误与绝对路径返回给 UI。

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
