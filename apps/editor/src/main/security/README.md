# Main 安全边界

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`editorFrameTrust.ts`](./editorFrameTrust.ts) | Electron WebFrameMain、URL | 阻止非 Editor 页面调用特权 IPC。 | `isSameEditorLocation`、`isTrustedEditorFrame`；同时校验窗口 ID、Frame 身份和文档 URL。 |
