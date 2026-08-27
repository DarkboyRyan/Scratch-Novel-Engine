# 国际化

[返回 Renderer](../README.md)

本目录提供 Editor React 界面的简体中文和英文资源，以及语言规范化与上下文访问。它只翻译软件界面，不改写作者输入的角色名、对白、场景名或项目内容。

## 架构位置与工作方式

1. `useEditorSettings` 从 Main 设置服务取得持久化语言，并在更新时接收跨窗口通知。
2. `EditorI18nProvider` 规范化语言，选择完整的 `EDITOR_LABELS` 字典并通过 React Context 提供给组件。
3. 组件使用标签键渲染界面；设置切换后整棵 Renderer 树自动采用新字典。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [editorLocalization.tsx](./editorLocalization.tsx) | React + TypeScript | 提供中英文文案、语言规范化和 React 国际化上下文 | `EditorLabels`、`EDITOR_LANGUAGES`、`EDITOR_LABELS`、`normalizeEditorLanguage`、`getEditorLabels`、`EditorI18nProvider` 等 10 项 |

## 开发与验证

- 两套字典必须具有完全相同的类型化键；作者内容和资产名称永远保持原文。
- 英文通常更长，新增标签还应检查紧凑顶栏、下拉框和窄窗口布局。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorLocalization.test.tsx tests/unit/editorEnglishDensityStyle.test.ts`。
