# 样式系统

[返回 Renderer](../README.md)

本目录定义 Renderer 的全局视觉基础和编辑器业务界面样式。`base.css` 建立颜色、排版和原生控件基线，`editor.css` 保留组件和业务布局，`editorTheme.css` 最后加载，集中收敛编辑器的视觉层级与响应式体验。

## 架构位置与工作方式

1. Renderer 入口依次加载 `base.css`、`editor.css` 和 `editorTheme.css`。`base.css` 的 `:root` 定义 Daylight token，`:root[data-editor-theme='moonlight']` 只覆盖同一组语义 token；组件不得绕开 token 复制一套主题颜色。
2. React 组件通过语义类名组合布局；Blockly 与 Player 预览等第三方或共享表面使用局部作用域覆盖。
3. 设置加载后，`App` 把 `data-editor-theme="daylight|moonlight"` 写到文档根节点，并同步原生 `color-scheme`；编辑器根容器也暴露同名属性供局部视觉验证。
4. 颜色主题只作用于 Editor chrome，包括顶栏、面板、表单、Blockly 外壳、Code 编辑器、资源管理和弹层。Player 预览中的作者页面样式、媒体内容以及导出游戏不随该偏好改变。
5. 媒体查询根据窗口宽度、高度和语言密度调整尺寸，确保核心操作与滚动区域始终可达。

## 主题 token

- Daylight 是默认主题：冷灰 `--canvas`、白色 `--panel` / `--input-surface`、石墨色文字和靛紫强调。
- Moonlight 在 `:root[data-editor-theme='moonlight']` 下提供深色画布与面板、浅色文字、暗色 Blockly/Code 表面和适配后的语义色。
- 两套主题共享 `--canvas`、`--panel`、`--text`、`--border`、`--primary`、`--danger`、`--success`、`--warning`、`--code-*`、`--blockly-*`、阴影和控件表面等 token 名；布局与功能规则无需按主题分叉。

## 视觉方向

- Daylight 采用冷灰画布、白色工作面与石墨色文字；Moonlight 使用分层深灰表面与浅色文字。两者都减少无意义的卡片、阴影和装饰色。
- 靛紫色的 3px“导演提示线”只表示当前工作区、时间线节点或资源；剧情内部的编辑方式使用紧凑分段控件，危险、成功和警告色仅表达对应语义。
- 标题使用展示字体栈，正文使用系统 UI 字体栈，代码和资源路径使用等宽字体栈；间距以 4px 为基础递增。
- 阴影只用于预览舞台、弹窗与浮层。普通面板依靠留白和 1px 分隔线建立层级。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [base.css](./base.css) | CSS | 定义 Daylight / Moonlight 语义 token、排版、滚动条和基础元素样式 | `:root`、`:root[data-editor-theme='moonlight']`、`body`、`select`、`:focus-visible` |
| [editor.css](./editor.css) | CSS | 定义编辑器布局、组件、Blockly、预览和响应式界面样式 | `.engine-startup`、`.engine-startup p`、`.engine-startup button`、`.editor-settings-bootstrap-indicator`、`to`、`.editor-settings-bootstrap-indicator` 等 427 项 |
| [editorTheme.css](./editorTheme.css) | CSS | 统一工作台色彩、层级、控件密度、选中提示和可访问性降级 | `.toolbar`、`.editor-mode-button`、`.dialogue-list`、`.preview-stage`、`.asset-manager`、`prefers-reduced-motion` |

## 开发与验证

- 优先复用现有变量和组件类，避免用全局选择器污染 Blockly 或共享 Player UI；交互态需包含键盘焦点和禁用状态。
- 固定高度区域必须配合 `min-height: 0`、滚动或响应式降级，并同时检查中英文文本长度。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorVisualSystem.test.ts tests/unit/editorEnglishDensityStyle.test.ts tests/unit/startScreenResponsiveStyle.test.ts tests/unit/titleModalStyle.test.ts`，视觉改动还需实际检查常用与小窗口尺寸。
