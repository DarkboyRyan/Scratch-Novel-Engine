# IPC 入口

[中文](./README.md) | [English](./README.en.md)

[返回 Electron Main](../README.md)

本目录是 Renderer 进入 Main 特权能力的唯一请求入口。所有入口先验证调用 Frame 和精确参数，再查找当前窗口上下文并调用业务服务；Renderer 不能向 Main 传入任意本机路径。

## 工作方式

1. Preload 把 Shared 中定义的通道和方法包装成类型化 `invoke` 调用。
2. `register*Ipc` 先验证可信 Frame，再用对应 `validate*Invocation` 拒绝多余键、非法枚举和越界数据。
3. 通过验证的请求进入窗口级服务，最终以结构化成功或错误结果返回 Renderer。

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [`registerAssetIpc.ts`](./registerAssetIpc.ts) | 处理图片、音频和视频的导入、重命名、逻辑批量删除与预览 URL。 |
| [`registerEditorSettingsIpc.ts`](./registerEditorSettingsIpc.ts) | 处理 Editor 语言与颜色主题设置的读取、窄 patch 更新和跨窗口广播。 |
| [`registerEngineIpc.ts`](./registerEngineIpc.ts) | 将引擎命令发送到 C++ 会话。 |
| [`registerExportIpc.ts`](./registerExportIpc.ts) | 接收游戏导出请求。 |
| [`registerProjectFileIpc.ts`](./registerProjectFileIpc.ts) | 接收项目文件操作。 |
| [`validateAssetInvocation.ts`](./validateAssetInvocation.ts) | 校验资产导入、查询和管理参数。 |
| [`validateEngineInvocation.ts`](./validateEngineInvocation.ts) | 校验全部引擎方法参数。 |
| [`validateExportInvocation.ts`](./validateExportInvocation.ts) | 校验导出模式和应用元数据。 |
| [`validateProjectFileInvocation.ts`](./validateProjectFileInvocation.ts) | 校验项目文件操作。 |

## 开发与验证

- 新 IPC 必须同时具备 Shared 契约、Preload 暴露、来源校验、精确参数校验和测试，不能把 `ipcMain` 处理器当作隐式校验器。
- 先运行对应的 `validate*.test.ts` 与 `register*.test.ts`，例如 `pnpm --dir apps/editor exec vitest run tests/unit/validateEngineInvocation.test.ts tests/unit/registerEngineIpc.test.ts`。
- 涉及项目格式或真实后端命令时，再运行 `pnpm --dir apps/editor test:integration`。
