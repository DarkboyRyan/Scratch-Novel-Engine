# Main 国际化

[返回 Electron Main](../README.md)

本目录集中保存 Electron 原生界面的中文和英文文案。Renderer 的 React 文案不从这里读取；这里专门服务应用菜单、原生对话框和窗口级提示，保证 Main 无需依赖 UI 层语言资源。

## 架构位置与工作方式

1. Editor 设置服务提供规范化后的 `zh-CN` 或 `en-US` 语言值。
2. `getEditorNativeLabels` 返回一套完整、类型化的原生文案。
3. 菜单和 Main 工作流消费这些标签；语言更新后重新构建相关原生界面。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`editorNativeLabels.ts`](./editorNativeLabels.ts) | TypeScript | 集中管理原生菜单、窗口和对话框文案。 | `EditorNativeLabels`、`getEditorNativeLabels`；按 `zh-CN` / `en-US` 返回完整标签。 |

## 开发与验证

- 两种语言必须保持相同键集合；新增 Main 提示时不要复用 Renderer 的 JSX 文案表。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorNativeLabels.test.ts tests/unit/installApplicationMenu.test.ts` 检查文案完整性和菜单消费路径。
