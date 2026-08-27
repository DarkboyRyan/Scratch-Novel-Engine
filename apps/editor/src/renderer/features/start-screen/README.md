# 标题界面

标题界面的表单、Blockly 编辑和界面导航。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [startScreenBlockEvents.ts](./startScreenBlockEvents.ts) | TypeScript + Blockly | 把标题界面积木字段变化转换为项目补丁 | `getStartScreenFieldUpdate` |
| [StartScreenBlocklyWorkspace.tsx](./StartScreenBlocklyWorkspace.tsx) | React + TypeScript + Blockly | 管理标题界面 Blockly 工作区及资源拖放同步 | `StartScreenBlocklyWorkspaceHandle`、`StartScreenBlocklyWorkspace` |
| [startScreenBlocks.ts](./startScreenBlocks.ts) | TypeScript + Blockly | 注册并投影标题界面根积木、背景和音乐积木 | `START_SCREEN_ROOT_BLOCK_TYPE`、`START_SCREEN_BACKGROUND_BLOCK_TYPE`、`START_SCREEN_MUSIC_BLOCK_TYPE`、`START_SCREEN_BLOCK_IDS`、`START_SCREEN_BLOCK_FIELDS`、`StartScreenAssetLabels` 等 13 项 |
| [StartScreenEditor.tsx](./StartScreenEditor.tsx) | React + TypeScript | 在表单与积木模式间切换标题界面编辑器 | `StartScreenEditorHandle`、`StartScreenEditor` |
| [StartScreenFormEditor.tsx](./StartScreenFormEditor.tsx) | React + TypeScript | 提供标题、背景图和背景音乐的表单配置界面 | `StartScreenFormEditor` |
| [startScreenScene.ts](./startScreenScene.ts) | TypeScript | 管理标题、CG 画廊和故事三类编辑界面导航状态 | `START_SCREEN_SCENE_ID`、`CG_GALLERY_SCENE_ID`、`EditorSurface`、`EditorSurfaceAction`、`initialEditorSurface`、`editorSurfaceReducer` 等 10 项 |
