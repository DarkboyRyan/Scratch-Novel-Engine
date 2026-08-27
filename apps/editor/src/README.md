# Editor 源码

[返回 Editor](../README.md)

该目录按 Electron 进程边界组织 Editor 的运行代码。主机权限、桥接契约与界面实现相互隔离，使每一层都能在自己的信任边界内演进。入口文件只负责装配，具体业务下沉到对应子目录。

## 架构位置与工作方式

1. [`main.ts`](./main.ts) 启动 Electron Main，装配窗口、IPC、后端和持久化服务。
2. [`preload.ts`](./preload.ts) 把 Shared 定义的最小接口桥接给沙箱 Renderer。
3. [`renderer/`](./renderer/README.md) 消费这些接口完成编辑，结果经 Main 和 C++ 后端写回项目或编译为运行包。

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

## 开发与验证

- 新能力应先明确属于 Main、Renderer 还是 Shared；不要跨目录绕过 IPC 边界复用实现。
- 修改入口或 Preload 后运行 `pnpm --dir apps/editor typecheck`，并执行 [`preloadBundle.test.ts`](../tests/unit/preloadBundle.test.ts) 等相关测试。
- 进程边界由 ESLint 规则保护，可用 `pnpm --dir apps/editor lint` 验证。
