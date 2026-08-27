# 标题界面

[返回功能模块](../README.md)

本目录编辑游戏标题页的标题上方文字、显示名称、背景图和循环音乐，并管理标题页、CG 画廊与故事编辑界面之间的导航。和故事编辑器一样，它同时提供表单与固定结构 Blockly 两种视图，并始终写回同一作者工程字段。

## 架构位置与工作方式

1. `startScreenScene.ts` 保存当前 Editor surface 与返回关系，`StartScreenEditor` 根据编辑模式选择表单或 Blockly。
2. 两种编辑器从项目生成标题页投影，资源拖放或字段变化经统一动作提交；Blockly 事件由 `startScreenBlockEvents.ts` 解析。
3. 更新后的项目同时驱动标题页编辑预览，并在导出后成为 Player 的主界面配置。标题上方
   文字默认是 `A VN ENGINE STORY`；保存空字符串会隐藏该行。

`startScreen.eyebrow` 与游戏名一起位于表单右侧内容区，也投影到 Blockly 根积木。提交时
会去除首尾 ASCII 空白；内容最多为 256 个 UTF-8 字节且不能包含 NUL。表单的
`maxLength=256` 只改善交互，C++ Core、Author Compiler 和 Player Reader 仍按 UTF-8
字节数执行最终边界校验。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [startScreenBlockEvents.ts](./startScreenBlockEvents.ts) | TypeScript + Blockly | 把标题界面积木字段变化转换为项目补丁 | `getStartScreenFieldUpdate` |
| [StartScreenBlocklyWorkspace.tsx](./StartScreenBlocklyWorkspace.tsx) | React + TypeScript + Blockly | 管理标题界面 Blockly 工作区及资源拖放同步 | `StartScreenBlocklyWorkspaceHandle`、`StartScreenBlocklyWorkspace` |
| [startScreenBlocks.ts](./startScreenBlocks.ts) | TypeScript + Blockly | 注册并投影标题上方文字、游戏名、背景和音乐积木 | `START_SCREEN_ROOT_BLOCK_TYPE`、`START_SCREEN_BACKGROUND_BLOCK_TYPE`、`START_SCREEN_MUSIC_BLOCK_TYPE`、`START_SCREEN_BLOCK_IDS`、`START_SCREEN_BLOCK_FIELDS`、`StartScreenAssetLabels` 等 13 项 |
| [StartScreenEditor.tsx](./StartScreenEditor.tsx) | React + TypeScript | 在表单与积木模式间切换标题界面编辑器 | `StartScreenEditorHandle`、`StartScreenEditor` |
| [StartScreenFormEditor.tsx](./StartScreenFormEditor.tsx) | React + TypeScript | 提供标题上方文字、游戏名、背景图和背景音乐的表单配置界面 | `StartScreenFormEditor` |
| [startScreenScene.ts](./startScreenScene.ts) | TypeScript | 管理标题、CG 画廊和故事三类编辑界面导航状态 | `START_SCREEN_SCENE_ID`、`CG_GALLERY_SCENE_ID`、`EditorSurface`、`EditorSurfaceAction`、`initialEditorSurface`、`editorSurfaceReducer` 等 10 项 |

## 开发与验证

- 表单和 Blockly 必须保持双向等价；根积木结构与软件托管入口不可被用户删除或任意重排。
- 标题资源为空时应使用明确默认状态；标题上方文字为空则不渲染，导航 ID 不得与真实故事场景 ID 混淆。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/startScreenEditor.test.tsx tests/unit/startScreenResponsiveStyle.test.ts`。
