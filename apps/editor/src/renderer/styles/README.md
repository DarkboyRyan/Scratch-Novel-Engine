# 样式系统

[返回 Renderer](../README.md)

本目录定义 Renderer 的全局视觉基础和编辑器业务界面样式。`base.css` 建立颜色、排版和原生控件基线，`editor.css` 再覆盖布局、组件、Blockly、预览、模态框和响应式行为。

## 架构位置与工作方式

1. Renderer 入口先加载基础样式，再加载编辑器样式，统一设计变量和默认元素行为。
2. React 组件通过语义类名组合布局；Blockly 与 Player 预览等第三方或共享表面使用局部作用域覆盖。
3. 媒体查询根据窗口宽度、高度和语言密度调整尺寸，确保核心操作与滚动区域始终可达。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [base.css](./base.css) | CSS | 定义编辑器全局色彩、排版、滚动条和基础元素样式 | `:root`、`*`、`body`、`select`、`select:focus-visible`、`select:disabled` |
| [editor.css](./editor.css) | CSS | 定义编辑器布局、组件、Blockly、预览和响应式界面样式 | `.engine-startup`、`.engine-startup p`、`.engine-startup button`、`.editor-settings-bootstrap-indicator`、`to`、`.editor-settings-bootstrap-indicator` 等 427 项 |

## 开发与验证

- 优先复用现有变量和组件类，避免用全局选择器污染 Blockly 或共享 Player UI；交互态需包含键盘焦点和禁用状态。
- 固定高度区域必须配合 `min-height: 0`、滚动或响应式降级，并同时检查中英文文本长度。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorEnglishDensityStyle.test.ts tests/unit/startScreenResponsiveStyle.test.ts tests/unit/titleModalStyle.test.ts`，视觉改动还需实际检查常用与小窗口尺寸。
