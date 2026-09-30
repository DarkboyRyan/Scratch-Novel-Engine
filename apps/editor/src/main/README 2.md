# Electron Main

[返回 Editor 源码](../README.md)

Main 进程持有文件系统、子进程、原生菜单和窗口等主机权限，并以“每窗口独立后端与文件会话”的方式服务 Renderer。这里不渲染业务界面，而是负责验证请求、组织有副作用的操作，并把结果转换为 Shared 契约中的数据。

## 架构位置与工作方式

1. [`createEditorWindow.ts`](./createEditorWindow.ts) 创建受限窗口，根入口再为窗口装配上下文和 IPC。
2. IPC 模块验证调用页面与参数，随后把请求交给后端、项目、媒体、设置或导出服务。
3. 服务返回结构化结果，并通过窗口状态或 Preload API 反馈给 Renderer；窗口销毁时对应会话一并释放。

## 子目录

| 目录 | 框架技术 | 主要作用 |
| --- | --- | --- |
| [`assets/`](./assets/README.md) | Electron Protocol、Node.js Stream | 安全提供本地资产预览。 |
| [`backend/`](./backend/README.md) | Node.js Child Process、JSONL | 管理 C++ 引擎进程和响应验证。 |
| [`export/`](./export/README.md) | Node.js FS、ZIP、Electron | 编译并导出运行包、Web 包和独立应用。 |
| [`i18n/`](./i18n/README.md) | TypeScript | 提供原生界面的中英文标签。 |
| [`ipc/`](./ipc/README.md) | Electron IPC | 注册可信 IPC 并验证所有请求。 |
| [`media/`](./media/README.md) | Node.js FileHandle | 识别媒体格式、内容和 Range。 |
| [`menu/`](./menu/README.md) | Electron Menu | 安装本地化应用菜单。 |
| [`project/`](./project/README.md) | Node.js FS、Electron Dialog | 管理项目目录、保存与发布。 |
| [`security/`](./security/README.md) | Electron WebFrameMain、URL | 验证 IPC 调用页面来源。 |
| [`settings/`](./settings/README.md) | TypeScript、Node.js FS | 管理并持久化 Editor 设置。 |
| [`window/`](./window/README.md) | Electron BrowserWindow | 维护窗口服务、互斥与显示状态。 |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`createEditorWindow.ts`](./createEditorWindow.ts) | Electron BrowserWindow | 创建安全、可级联的编辑器窗口。 | `resolveEditorEntryUrl`、`createEditorWindow`；限制导航、新窗口和 WebPreferences。 |

## 开发与验证

- Main 接收的所有 Renderer 数据都必须经过精确校验；任何本机路径应由 Main 自己选择或解析。
- 新增窗口级服务时，要在关闭路径中释放文件句柄、协议会话或子进程，并补充相应 IPC/服务单元测试。
- 使用 `pnpm --dir apps/editor exec vitest run tests/unit/registerEngineIpc.test.ts tests/unit/editorFrameTrust.test.ts` 验证典型 Main 边界，再运行 `pnpm --dir apps/editor typecheck`。
