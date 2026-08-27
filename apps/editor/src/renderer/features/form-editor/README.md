# 表单编辑器

传统表单模式的场景、时间线和节点属性编辑。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [FormEditor.tsx](./FormEditor.tsx) | React + TypeScript | 组合场景表单、属性检查器、资源面板和预览面板 | `FormEditor` |
| [formLogicTree.ts](./formLogicTree.ts) | TypeScript | 把逻辑时间线节点转换为表单编辑器可展示的树结构 | `FormLogicTreeEntry`、`createFormLogicTree`、`getCharacterGroupDialogueAnchorId` |
| [InspectorPanel.tsx](./InspectorPanel.tsx) | React + TypeScript | 编辑当前时间线节点的对白、媒体、角色和逻辑属性 | `InspectorPanel` |
| [ScenePanel.tsx](./ScenePanel.tsx) | React + TypeScript | 管理场景列表、时间线节点选择及新增删除操作 | `ScenePanel` |
| [timelinePreview.ts](./timelinePreview.ts) | TypeScript | 从选中时间线位置推导背景、角色和媒体预览状态 | `TimelineCharacterState`、`TimelinePreviewState`、`deriveTimelinePreview` |
| [useFormEditor.ts](./useFormEditor.ts) | TypeScript | 集中管理表单编辑器选择状态、草稿和创作命令 | `useFormEditor`、`FormEditorState` |
