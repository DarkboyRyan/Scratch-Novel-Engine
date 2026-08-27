# Blockly 故事编辑器

[返回功能模块](../README.md)

本目录实现故事的 Blockly 图形化编辑界面，包括工作区生命周期、工具箱分类、项目投影、拖放同步、积木组移动和场景布局保存。Blockly 是作者工程的可视化投影而非独立数据源；所有有效编辑最终都要转换为 Engine 命令。

## 架构位置与工作方式

1. `projectSceneToWorkspace.ts` 和 [`blocks/`](./blocks/README.md) 把当前场景投影成具有稳定 ID、字段和连接约束的积木树。
2. `BlocklyWorkspace.tsx` 监听创建、删除、字段变更和移动事件，各 `*BlockEvents.ts` 将其解析为作者语义动作。
3. Engine 成功后重新投影项目；布局模块单独保留坐标和视口，避免业务刷新打乱用户工作区。

## 子目录

| 目录 | 主要作用 |
| --- | --- |
| [blocks](./blocks/README.md) | 故事编辑器中各类 Blockly 积木的定义与字段读写。 |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [BlockEditor.tsx](./BlockEditor.tsx) | React + TypeScript | 组合 Blockly 工作区、场景导航、资源面板和预览面板 | `BlockEditorHandle`、`BlockEditor` |
| [blockEditorLayout.ts](./blockEditorLayout.ts) | TypeScript + Blockly | 捕获并恢复场景积木坐标、视口和自动布局状态 | `WorkspacePoint`、`SceneWorkspaceLayout`、`BlockEditorLayoutStore`、`captureSceneWorkspaceLayout`、`restoreSceneWorkspaceViewport` |
| [blockGroupDrag.ts](./blockGroupDrag.ts) | TypeScript + Blockly | 实现故事积木组拖动时的拓扑收集与整体位移 | `BlockGroupDragController`、`BlockGroupSelectionMode`、`getBlockGroupSelectionMode`、`createBlockGroupDragController` |
| [BlocklyWorkspace.tsx](./BlocklyWorkspace.tsx) | React + TypeScript + Blockly | 管理故事 Blockly 工作区生命周期、投影、拖拽事件与引擎命令同步 | `BlocklyWorkspaceHandle`、`BlocklyWorkspace` |
| [blockSelection.ts](./blockSelection.ts) | TypeScript + Blockly | 统一 Blockly 积木选中、取消选中和选择状态读取 | `BlockSelectionController`、`getBlockClientRectangle`、`createBlockSelectionController` |
| [cgDisplayBlockEvents.ts](./cgDisplayBlockEvents.ts) | TypeScript + Blockly | 把 CG 显示积木的拖放和字段变化转换为引擎变更 | `CgDisplayFieldDraft`、`CgDisplayDraftCollection`、`NewCgDisplayDrop`、`CgDisplayReorderResolution`、`CgDisplayDeleteResolution`、`isInvalidCgDisplayBodyDrop` 等 11 项 |
| [characterBlockEvents.ts](./characterBlockEvents.ts) | TypeScript + Blockly | 区分新增人物占位、清除操作，并解析字段更新 | `resolveNewCharacterPlacement`、`CharacterFieldUpdate`、`getCharacterFieldUpdate` |
| [characterEffectBlockEvents.ts](./characterEffectBlockEvents.ts) | TypeScript + Blockly | 解析人物特效积木的连接、字段更新和顺序变更 | `CharacterEffectFieldDraft`、`CharacterEffectMutation`、`getCharacterEffectMutation`、`collectCharacterEffectFieldDrafts`、`getCharacterEffectOwnerForDelete` |
| [choiceBlockEvents.ts](./choiceBlockEvents.ts) | TypeScript + Blockly | 解析选项及选项分支积木的创建、编辑和排序事件 | `ChoiceOptionLocation`、`ChoiceOptionFieldUpdate`、`NewChoiceOptionDrop`、`NewChoiceOptionDropResolution`、`ChoiceOptionReorderDrop`、`findChoiceOption` 等 11 项 |
| [dialogueBlockEvents.ts](./dialogueBlockEvents.ts) | TypeScript + Blockly | 解析对白积木拖放、草稿字段更新与时间线重排 | `DialogueFieldUpdate`、`DialogueFieldDraft`、`NewDialogueDrop`、`NewStoryExtensionDrop`、`NewStoryExtensionDropResolution`、`DialogueReorderDrop` 等 14 项 |
| [dialogueGroupReorder.ts](./dialogueGroupReorder.ts) | TypeScript | 计算对白组在时间线中的批量重排参数 | `TimelineDropTarget`、`TimelineDropSlot`、`DIALOGUE_GROUP_SNAP_RADIUS_PX`、`getTimelineDropSlotForPoint`、`reorderNodeIds`、`buildGroupReorderParams` |
| [EngineTrashcan.ts](./EngineTrashcan.ts) | TypeScript + Blockly | 实现 Blockly 工作区使用的简洁自定义垃圾桶控件 | `EngineTrashcan` |
| [logicBlockEvents.ts](./logicBlockEvents.ts) | TypeScript + Blockly | 把变量、条件和循环积木事件转换为逻辑节点命令 | `LogicFieldDraft`、`LogicDraftCollection`、`NewLogicBlockDrop`、`LogicControlReorderResolution`、`LogicControlDeleteResolution`、`collectLogicFieldDrafts` 等 10 项 |
| [logicStructure.ts](./logicStructure.ts) | TypeScript | 校验和分析可嵌套逻辑积木的结构、范围与时间线位置 | `VisibleLeafNode`、`LogicStructureItem`、`parseLogicStructure`、`flattenLogicStructure`、`findLogicControlItem`、`findCgDisplayItem` 等 8 项 |
| [projectSceneToWorkspace.ts](./projectSceneToWorkspace.ts) | TypeScript + Blockly | 把场景文档投影为带嵌套结构和资源状态的 Blockly 积木 | `projectSceneToWorkspace` |
| [sceneJumpBlockEvents.ts](./sceneJumpBlockEvents.ts) | TypeScript + Blockly | 处理跳转场景积木的创建与目标场景更新 | `SceneJumpFieldUpdate`、`getSceneJumpFieldUpdate` |
| [singleDialogueBlockDragStrategy.ts](./singleDialogueBlockDragStrategy.ts) | TypeScript + Blockly | 限制单个对白积木拖动并维护故事序列连接 | `SingleDialogueBlockDragStrategy` |
| [storyBlockPagination.ts](./storyBlockPagination.ts) | TypeScript + Blockly | 计算长故事积木分页、续页边界和页面导航状态 | `StoryBlockPage`、`paginateStoryNodes`、`isStoryPaginationProjectionConsistent` |
| [storyBlockTypes.ts](./storyBlockTypes.ts) | TypeScript | 集中维护故事积木类型、类别与类型判断集合 | `STORY_BLOCK_TYPES`、`isStoryBlockType` |
| [storyContinuationBlockEvents.ts](./storyContinuationBlockEvents.ts) | TypeScript + Blockly | 处理故事续页积木的顺序变化和页面重排命令 | `StoryContinuationSequenceResolution`、`buildStoryContinuationPageReorder`、`getStoryContinuationSequenceUpdate`、`collectStoryContinuationSequenceDraft` |
| [toolbox.ts](./toolbox.ts) | TypeScript + Blockly | 按类别构建本地化 Blockly 工具箱配置 | `createBlockEditorToolbox` |
| [zoomControlIcons.ts](./zoomControlIcons.ts) | TypeScript | 创建并安装 Blockly 缩放控件 SVG 图标 | `installInlineZoomControlIcons` |

## 开发与验证

- 积木 ID、连接检查器和后端节点 ID 具有持久语义；事件处理中要区分程序化投影与真实用户操作，防止回写循环。
- 新积木需同步定义、工具箱分类、项目投影、事件转换、本地化和测试；逻辑容器还要验证嵌套结构。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/logicBlocks.test.ts tests/unit/logicBlockEvents.test.ts tests/unit/blockEditorLayout.test.ts`，涉及完整工作区时补充对应 `blocklyWorkspace*.test.tsx`。
