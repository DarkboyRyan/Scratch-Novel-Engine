# 应用菜单

[返回 Electron Main](../README.md)

本目录负责创建 Electron 原生应用菜单，并把项目级命令发送给当前聚焦的 Editor 窗口。菜单只负责平台结构、本地化和命令路由，具体的新建、打开、保存行为仍由 Renderer 与 Main 项目工作流完成。

## 架构位置与工作方式

1. 启动或语言变化时，Main 从 [`../i18n/`](../i18n/README.md) 取得原生标签。
2. `installApplicationMenu` 根据平台构建菜单模板，并保留 Electron 标准角色。
3. 用户触发项目命令后，菜单向聚焦窗口发送受控事件，由 Renderer 走正常项目文件 API。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`installApplicationMenu.ts`](./installApplicationMenu.ts) | Electron Menu | 安装跨平台、本地化的应用菜单。 | `installApplicationMenu` 构建模板；向聚焦窗口发送新建、打开、保存命令。 |

## 开发与验证

- 菜单事件名必须与 Shared/Preload 的订阅契约一致；平台专属角色要保留 macOS、Windows 和 Linux 的原生习惯。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/installApplicationMenu.test.ts tests/unit/editorNativeLabels.test.ts`。
