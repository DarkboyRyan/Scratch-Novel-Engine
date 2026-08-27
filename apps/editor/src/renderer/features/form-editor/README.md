# 表单编辑器

[返回功能模块](../README.md)

本目录实现传统表单式的故事场景编辑体验，面向不希望直接操作 Blockly 的用户。它把场景列表、时间线、属性检查器、资源面板和静态预览组合起来，并兼容作者工程中的选择、逻辑、CG 和人物状态。

## 架构位置与工作方式

1. `useFormEditor.ts` 根据项目和当前场景管理选择、草稿与创作动作，`formLogicTree.ts` 把扁平逻辑标记组织成可读树。
2. `ScenePanel` 选择或增删时间线节点，`InspectorPanel` 编辑节点属性并通过统一动作提交。
3. `timelinePreview.ts` 从选中位置归约背景、人物、CG 和媒体状态，`FormEditor` 将结果交给通用预览组件。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [FormEditor.tsx](./FormEditor.tsx) | React + TypeScript | 组合场景表单、属性检查器、资源面板和预览面板 | `FormEditor` |
| [formLogicTree.ts](./formLogicTree.ts) | TypeScript | 把逻辑时间线节点转换为表单编辑器可展示的树结构 | `FormLogicTreeEntry`、`createFormLogicTree`、`getCharacterGroupDialogueAnchorId` |
| [InspectorPanel.tsx](./InspectorPanel.tsx) | React + TypeScript | 编辑当前时间线节点的对白、媒体、角色和逻辑属性 | `InspectorPanel` |
| [ScenePanel.tsx](./ScenePanel.tsx) | React + TypeScript | 管理场景列表、时间线节点选择及新增删除操作 | `ScenePanel` |
| [timelinePreview.ts](./timelinePreview.ts) | TypeScript | 从选中时间线位置推导背景、角色和媒体预览状态 | `TimelineCharacterState`、`TimelinePreviewState`、`deriveTimelinePreview` |
| [useFormEditor.ts](./useFormEditor.ts) | TypeScript | 集中管理表单编辑器选择状态、草稿和创作命令 | `useFormEditor`、`FormEditorState` |

## 开发与验证

- 选择状态和输入草稿是本地 UI 状态，场景节点与顺序仍以 Engine 返回项目为准；删除或切换场景后要修正失效选择。
- 表单不能静默改写暂不支持的逻辑结构，复杂节点应保持可见或给出明确只读提示。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/formLogicTree.test.ts tests/unit/timelinePreview.test.ts tests/unit/formChoiceCompatibility.test.tsx`。
