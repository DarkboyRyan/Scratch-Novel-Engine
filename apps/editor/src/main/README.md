# Electron Main

Main 进程持有所有主机权限，并以“每窗口独立后端与文件会话”的方式服务 Renderer。

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
