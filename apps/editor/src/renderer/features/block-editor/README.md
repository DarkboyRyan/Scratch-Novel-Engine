# Blockly 故事编辑器

[中文](./README.md) | [English](./README.en.md)

[返回功能模块](../README.md)

本目录实现故事的 Blockly 图形化编辑界面，包括工作区生命周期、工具箱分类、项目投影、拖放同步、积木组移动和场景布局保存。Blockly 是作者工程的可视化投影而非独立数据源；所有有效编辑最终都要转换为 Engine 命令。

## 工作方式

1. `projectSceneToWorkspace.ts` 和 [`blocks/`](./blocks/README.md) 把当前场景投影成具有稳定 ID、字段和连接约束的积木树。
2. `BlocklyWorkspace.tsx` 监听创建、删除、字段变更和移动事件，各 `*BlockEvents.ts` 将其解析为作者语义动作。
3. Engine 成功后重新投影项目；布局模块单独保留坐标和视口，避免业务刷新打乱用户工作区。
4. 背景与人物立绘积木使用统一的 10%–300% 整数缩放字段；事件层同时收集未失焦草稿，热更新后缺字段的旧积木会在投影时原位升级。
5. “新建 / 设置变量”保留自由名称输入；“修改数值变量”和 If/Else 的“现有变量”操作数从项目全部 Set 节点的稳定去重名称中选择，支持输入名称前缀筛选，并为旧项目的孤立引用保留原值。
6. 场景头部管理初始背景与缩放；背景、立绘、对白语音、BGM 和视频积木通过可搜索下拉框选择资源管理区中的既有资源，字段值始终保存稳定资源 ID。
7. 三种 Blockly 编辑界面共享工作区移动配置：左键拖动空白画布可平移；故事页静止长按空白仍进入框选，积木及多选组拖动保持独立。
8. 故事页和 CG 画廊的左侧分类展开时，积木面板占用独立的视口宽度，主画布向右让位；收起时还原。布局通过 Blockly metrics 计算，不改动积木坐标和项目数据。

## 子目录

| 目录 | 主要作用 |
| --- | --- |
| [blocks](./blocks/README.md) | 故事编辑器中各类 Blockly 积木的定义与字段读写。 |

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [BlockEditor.tsx](./BlockEditor.tsx) | 组合 Blockly 工作区、场景导航、初始背景设置和预览面板 |
| [blockEditorLayout.ts](./blockEditorLayout.ts) | 捕获并恢复场景积木坐标、视口和自动布局状态 |
| [blockGroupDrag.ts](./blockGroupDrag.ts) | 实现故事积木组拖动时的拓扑收集与整体位移 |
| [blocklyWorkspaceMovement.ts](./blocklyWorkspaceMovement.ts) | 统一故事、标题界面和 CG 画廊的滚动条及空白画布拖动配置 |
| [dockedToolbox.ts](./dockedToolbox.ts) | 分类面板展开与收起时同步主画布视口、滚动条和控件位置 |
| [BlocklyWorkspace.tsx](./BlocklyWorkspace.tsx) | 管理故事 Blockly 工作区生命周期、投影、拖拽事件与引擎命令同步 |
| [blockSelection.ts](./blockSelection.ts) | 统一 Blockly 积木选中、取消选中和选择状态读取 |
| [backgroundBlockEvents.ts](./backgroundBlockEvents.ts) | 解析背景积木缩放字段并收集未提交草稿 |
| [cgDisplayBlockEvents.ts](./cgDisplayBlockEvents.ts) | 把 CG 显示积木的拖放和字段变化转换为引擎变更 |
| [characterBlockEvents.ts](./characterBlockEvents.ts) | 区分新增人物占位、清除操作，并解析位置、层级与缩放草稿 |
| [characterEffectBlockEvents.ts](./characterEffectBlockEvents.ts) | 解析人物特效积木的连接、字段更新和顺序变更 |
| [choiceBlockEvents.ts](./choiceBlockEvents.ts) | 解析选项及选项分支积木的创建、编辑和排序事件 |
| [dialogueBlockEvents.ts](./dialogueBlockEvents.ts) | 解析对白积木拖放、草稿字段更新与时间线重排 |
| [dialogueGroupReorder.ts](./dialogueGroupReorder.ts) | 计算对白组在时间线中的批量重排参数 |
| [EngineTrashcan.ts](./EngineTrashcan.ts) | 实现 Blockly 工作区使用的简洁自定义垃圾桶控件 |
| [logicBlockEvents.ts](./logicBlockEvents.ts) | 把变量、条件和循环积木事件转换为逻辑节点命令 |
| [logicStructure.ts](./logicStructure.ts) | 校验和分析可嵌套逻辑积木的结构、范围与时间线位置 |
| [projectSceneToWorkspace.ts](./projectSceneToWorkspace.ts) | 把场景文档投影为带嵌套结构和资源状态的 Blockly 积木 |
| [sceneJumpBlockEvents.ts](./sceneJumpBlockEvents.ts) | 处理跳转场景积木的创建与目标场景更新 |
| [singleDialogueBlockDragStrategy.ts](./singleDialogueBlockDragStrategy.ts) | 限制单个对白积木拖动并维护故事序列连接 |
| [storyBlockPagination.ts](./storyBlockPagination.ts) | 计算长故事积木分页、续页边界和页面导航状态 |
| [storyBlockTypes.ts](./storyBlockTypes.ts) | 集中维护故事积木类型、类别与类型判断集合 |
| [storyContinuationBlockEvents.ts](./storyContinuationBlockEvents.ts) | 处理故事续页积木的顺序变化和页面重排命令 |
| [toolbox.ts](./toolbox.ts) | 按类别构建本地化 Blockly 工具箱配置 |
| [zoomControlIcons.ts](./zoomControlIcons.ts) | 创建并安装 Blockly 缩放控件 SVG 图标 |

## 开发与验证

- 积木 ID、连接检查器和后端节点 ID 具有持久语义；事件处理中要区分程序化投影与真实用户操作，防止回写循环。
- 新积木需同步定义、工具箱分类、项目投影、事件转换、本地化和测试；逻辑容器还要验证嵌套结构。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/logicBlocks.test.ts tests/unit/logicBlockEvents.test.ts tests/unit/blockEditorLayout.test.ts`，涉及完整工作区时补充对应 `blocklyWorkspace*.test.tsx`。
