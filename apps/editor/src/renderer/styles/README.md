# 样式系统

Renderer 的全局基础样式和编辑器业务样式。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [base.css](./base.css) | CSS | 定义编辑器全局色彩、排版、滚动条和基础元素样式 | `:root`、`*`、`body`、`select`、`select:focus-visible`、`select:disabled` |
| [editor.css](./editor.css) | CSS | 定义编辑器布局、组件、Blockly、预览和响应式界面样式 | `.engine-startup`、`.engine-startup p`、`.engine-startup button`、`.editor-settings-bootstrap-indicator`、`to`、`.editor-settings-bootstrap-indicator` 等 427 项 |
