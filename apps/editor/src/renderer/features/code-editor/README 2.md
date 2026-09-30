# Code 编辑页

[返回 Features](../README.md)

跨 Renderer、Electron、C++、Author/Runtime 与 Player 的完整实现见
[Code Section 技术栈](../../../../../../docs/code-section-technical-stack.md)。

Code 页同时承载故事场景的可编辑 DSL，以及主界面和 CG 画廊的可编辑样式 DSL。
三种视图共用同一 Author Project 权威数据；Code 源文本只是投影或临时草稿，不是
第二份项目文件。

## 故事场景：可编辑投影

`projectSceneToReadonlyCode` 把当前权威 `SceneDocument` 投影为稳定故事 DSL，
输入过程中不写项目也不发送 Engine 命令。`parseEditableSceneCode` 对同一封闭语法做
严格逆向解析；大的时间线/Blockly 动作在外层，特效、层级、缩放等小配置放在括号内：

```text
story 1

scene("Wake Up") {
  background(image("assets/images/Bedroom"), scale: 80, initial: true)
  say("What happened?", speaker: "Gregor")
  show(image("assets/images/Gregor"), at: right, layer: 2, scale: 90, effect: shake(600ms, normal))
}
```

`sourceRanges` 把场景节点和选项 ID 映射到一基行范围，
`findDeepestCodeSourceRange` 在嵌套范围中选择最具体的作者项。`diagnostics` 只报告
失效引用和隐藏 marker 结构，不修复权威场景。逻辑和 CG 范围复用
`block-editor/logicStructure` 投影，隐藏 Else/End marker 不会暴露给用户。

资源字符串是由公开媒体类型和显示名生成的可读逻辑路径。它不是 Asset ID，
不包含项目相对路径或主机绝对路径，也不能传给文件系统或导出 API。

点击“应用代码”后，Renderer 只把解析出的类型化 `SceneContentDraft` 发送给
`scene.content.replace`。C++ 在候选 Project 上复用能够证明身份的既有节点/选项 ID，
为新增项生成 ID，重建 If/Repeat/CG 的隐藏配对 marker，并在完整校验成功后一次提交；
失败与语义 no-op 都不会产生部分时间线或额外 revision。

格式错误、名称歧义或权威冲突只保存在当前窗口的 Code 草稿中，不进入 C++；切到
Form/Blockly 时看到的仍是最后成功应用的权威内容，返回 Code 可继续修复原草稿。
为了避免用户误以为错误代码已经发布，只要任一页面仍有未应用草稿，保存、导出、
预览和资源导入会被严格阻止。草稿不写入 Author 文件，打开另一项目并确认丢弃后清除。

剧情与页面样式的 textarea 共用 `codeTextareaEditing.ts`：Tab 以两个空格缩进，
Shift+Tab 反向缩进，多行选区按行整体处理；Enter 继承当前行缩进，并在
`{}` / `()` / `[]` 中间自动展开内层空行。光标与选区在 React 更新后恢复；中文
IME 组合输入和 Ctrl/Meta/Alt 修饰键不会被拦截。为避免 Tab 造成键盘焦点陷阱，
用户可先按 Esc，再按 Tab 或 Shift+Tab 移出编辑框。

## 主界面和 CG 画廊：受限样式 DSL

`surfaceStyleCode.ts` 在两个固定 wrapper 与类型化 DTO 之间格式化/解析：

```text
main_screen(
  style_version: 1,
  font: system,
  font_scale: 100,
  page: "#0B0C0F",
  text: "#FFFFFF",
  muted_text: "#B8BCC6",
  surface: "#0C0F14",
  surface_opacity: 0,
  accent: "#FFFFFF",
  overlay: "#040609",
  overlay_opacity: 44,
  radius: 0,
  layout: split-right,
  background_fit: contain
)
```

CG 画廊使用 `cg_gallery(...)`，并把页面特有字段换成
`layout: framed | edge-to-edge`、`thumbnail_fit: contain | cover` 和 `gap: 0..32`。
两个页面的共用白名单为：

- `font`: `system | serif | rounded | mono`；`font_scale`: 75–150 整数；
- `page` / `text` / `muted_text` / `surface` / `accent` / `overlay`: `#RRGGBB`；
- `surface_opacity` / `overlay_opacity`: 0–100 整数；`radius`: 0–48 整数像素。

主界面额外允许 `layout: split-right | split-left | center` 和
`background_fit: contain | cover`。解析器要求 exact fields，拒绝未知/重复/缺失字段、
越界数字、非规范颜色、错误 wrapper 和超过 16 KiB 的 UTF-8 源文本。它不接收
原始 CSS、JavaScript、选择器、HTML 或 URL。

点击应用时，编辑器只发送解析后的 `StartScreenStyleDocument` 或
`CgGalleryStyleDocument`。C++ 命令独立更新 `style`，不重建或改写标题内容、背景/音乐、
CG 页面与图片排序。未提交草稿纳入 Editor dirty/保存阻断流程；权威样式在草稿
编辑期间被外部更改时会显示冲突，不静默覆盖。恢复默认也会通过同一严格命令提交。

## 格式与导出边界

Author v22 首次要求 `startScreen.style` 和 `cgGallery.style`；Author v1–v21 由 Reader
补安全默认值。Runtime v13 将同一 DTO 导出给 Desktop/Web Player，runtime v1–v12
也由 Player Reader 补默认值。`style_version: 1` 是 Code DSL 合同版本，不是 Author
或 Runtime 版本。Runtime Snapshot 仍为 v5，因为页面样式不属于剧情进度。

## 文件索引

| 文件 | 主要作用 |
| --- | --- |
| [`CodeEditor.tsx`](./CodeEditor.tsx) | 根据目标渲染可编辑剧情或样式草稿，处理应用、冲突、重载与预览。 |
| [`sceneCodeProjection.ts`](./sceneCodeProjection.ts) | 生成故事 DSL、诊断与源范围。 |
| [`sceneCodeParser.ts`](./sceneCodeParser.ts) | 严格解析故事 DSL、解析引用、复用身份并生成原子场景草稿。 |
| [`codeFormatter.ts`](./codeFormatter.ts) | 稳定格式化故事源文并查找最深层源范围。 |
| [`codeTextareaEditing.ts`](./codeTextareaEditing.ts) | 处理 Tab/反向缩进、Enter 自动对齐和选区恢复坐标。 |
| [`surfaceStyleCode.ts`](./surfaceStyleCode.ts) | 格式化和严格解析主界面/CG 样式 DSL。 |
