# Editor 单元测试

[返回 Editor 测试](../README.md)

本目录收录 Editor 的 Vitest 单元测试和基于 JSDOM 的轻量交互测试，覆盖 Renderer、Main、Preload、导出、Blockly 与 Shared 协议边界。用例尽量直接针对一个模块或一条用户交互，外部进程与真实跨应用链路留给 [`../integration/`](../integration/README.md)。

## 架构位置与工作方式

1. 纯 TypeScript 测试直接验证转换、校验器、状态机与文件服务，并为不可信输入覆盖拒绝路径。
2. `*.test.tsx` 使用 Testing Library/JSDOM 渲染组件或工作区，检查用户可观察行为和回调。
3. 导出与 Main 测试在临时目录或受控替身上执行，保证快速、可重复且不依赖用户环境。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [assetPreviewService.test.ts](./assetPreviewService.test.ts) | Vitest + TypeScript | 验证 AssetPreviewService 的行为 | `AssetPreviewService` |
| [authorProjectCompiler.test.ts](./authorProjectCompiler.test.ts) | Vitest + TypeScript | 验证 author project v21 compiler、标题上方文字、图片缩放、人物模式迁移和 Runtime 投影 | `author project v21 compiler` |
| [backendClientTimeout.test.ts](./backendClientTimeout.test.ts) | Vitest + TypeScript | 验证 backend request timeout 的行为 | `backend request timeout` |
| [backendResponse.test.ts](./backendResponse.test.ts) | Vitest + TypeScript | 验证 backend response validation 的行为 | `backend response validation` |
| [backgroundBlockEvents.test.ts](./backgroundBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证背景缩放字段、草稿收集和 HMR 旧积木升级 | `getBackgroundFieldUpdate`、`collectBackgroundFieldDrafts` |
| [blockEditorLayout.test.ts](./blockEditorLayout.test.ts) | Vitest + TypeScript + Blockly | 验证 captureSceneWorkspaceLayout、restoreSceneWorkspaceViewport 的行为 | `captureSceneWorkspaceLayout`、`restoreSceneWorkspaceViewport` |
| [blockGroupDrag.test.ts](./blockGroupDrag.test.ts) | Vitest + TypeScript + Blockly + JSDOM | 验证 logic-aware block group selection 的行为 | `logic-aware block group selection` |
| [blocklyWorkspaceCgDisplayIntegration.test.tsx](./blocklyWorkspaceCgDisplayIntegration.test.tsx) | Vitest + React + TypeScript + Blockly + JSDOM | 验证 BlocklyWorkspace CG-display action integration 的行为 | `BlocklyWorkspace CG-display action integration` |
| [blocklyWorkspaceCharacterEffectIntegration.test.tsx](./blocklyWorkspaceCharacterEffectIntegration.test.tsx) | Vitest + React + TypeScript + Blockly + JSDOM | 验证 BlocklyWorkspace portrait-effect action integration 的行为 | `BlocklyWorkspace portrait-effect action integration` |
| [blocklyWorkspaceLogicIntegration.test.tsx](./blocklyWorkspaceLogicIntegration.test.tsx) | Vitest + React + TypeScript + Blockly + JSDOM | 验证逻辑命令、项目级 If 变量候选、前缀搜索及选择后的后端更新 | `BlocklyWorkspace logic action integration` |
| [blocklyWorkspaceVariableIntegration.test.tsx](./blocklyWorkspaceVariableIntegration.test.tsx) | Vitest + React + TypeScript + Blockly + JSDOM | 验证项目级变量候选、孤立引用兼容、空占位及新增/更新恢复 | `BlocklyWorkspace variable dropdown integration` |
| [cgDisplayBlock.test.ts](./cgDisplayBlock.test.ts) | Vitest + TypeScript + Blockly | 验证 CG display block 的行为 | `CG display block` |
| [cgDisplayBlockEvents.test.ts](./cgDisplayBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证 CG display dialogue-only body drops 的行为 | `CG display dialogue-only body drops` |
| [cgGalleryEditor.test.tsx](./cgGalleryEditor.test.tsx) | Vitest + React + TypeScript + Blockly + JSDOM | 验证 CG gallery Editor 的行为 | `CG gallery Editor` |
| [characterBlockEvents.test.ts](./characterBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证人物占位/清除语义、缩放草稿及 HMR 升级 | `resolveNewCharacterPlacement`、`getCharacterFieldUpdate`、`collectCharacterFieldDrafts` |
| [characterEffectBlock.test.ts](./characterEffectBlock.test.ts) | Vitest + TypeScript + Blockly | 验证 character portrait effect blocks 的行为 | `character portrait effect blocks` |
| [characterEffectBlockEvents.test.ts](./characterEffectBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证 character effect block events 的行为 | `character effect block events` |
| [characterPositionForm.test.tsx](./characterPositionForm.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 character position form controls 的行为 | `character position form controls` |
| [choiceBlock.test.ts](./choiceBlock.test.ts) | Vitest + TypeScript + Blockly | 验证 choice Blockly blocks 的行为 | `choice Blockly blocks` |
| [choiceBlockEvents.test.ts](./choiceBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证 choice option Blockly events 的行为 | `choice option Blockly events` |
| [createAuthoringActions.test.ts](./createAuthoringActions.test.ts) | Vitest + TypeScript | 验证 createAuthoringActions 的行为 | `createAuthoringActions` |
| [dialogueBlockEvents.test.ts](./dialogueBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证 timeline anchors after top-level logic controls、getDroppedNewDialogueBlock、getNewStoryExtensionDropResolution 等行为 | `timeline anchors after top-level logic controls`、`getDroppedNewDialogueBlock`、`getNewStoryExtensionDropResolution`、`getDialogueFieldUpdate`、`collectDialogueFieldDrafts`、`getReorderedDialogueBlock` 等 7 项 |
| [dialogueGroupReorder.test.ts](./dialogueGroupReorder.test.ts) | Vitest + TypeScript | 验证 dialogue group reorder 的行为 | `dialogue group reorder` |
| [editorEnglishDensityStyle.test.ts](./editorEnglishDensityStyle.test.ts) | Vitest + TypeScript | 验证 English Editor density style contract 的行为 | `English Editor density style contract` |
| [editorFrameTrust.test.ts](./editorFrameTrust.test.ts) | Vitest + TypeScript | 验证 editor frame trust 的行为 | `editor frame trust` |
| [editorLocalization.test.tsx](./editorLocalization.test.tsx) | Vitest + React + TypeScript + Blockly + JSDOM | 验证 Editor localization 的行为 | `Editor localization` |
| [editorNativeLabels.test.ts](./editorNativeLabels.test.ts) | Vitest + TypeScript | 验证 Editor native labels 的行为 | `Editor native labels` |
| [editorSettingsManager.test.ts](./editorSettingsManager.test.ts) | Vitest + TypeScript | 验证 EditorSettingsManager 的行为 | `EditorSettingsManager` |
| [editorSettingsProtocol.test.ts](./editorSettingsProtocol.test.ts) | Vitest + TypeScript | 验证 Editor settings protocol 的行为 | `Editor settings protocol` |
| [editorSettingsStore.test.ts](./editorSettingsStore.test.ts) | Vitest + TypeScript | 验证 EditorSettingsStore 的行为 | `EditorSettingsStore` |
| [editorWindowPlacement.test.ts](./editorWindowPlacement.test.ts) | Vitest + TypeScript | 验证 editor window placement 的行为 | `editor window placement` |
| [exportFileLock.test.ts](./exportFileLock.test.ts) | Vitest + TypeScript | 验证 export file lock 的行为 | `export file lock` |
| [formCharacterInsertion.test.tsx](./formCharacterInsertion.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 form character insertion 的行为 | `form character insertion` |
| [formChoiceCompatibility.test.tsx](./formChoiceCompatibility.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 form editor choice compatibility 的行为 | `form editor choice compatibility` |
| [formLogicTree.test.ts](./formLogicTree.test.ts) | Vitest + TypeScript | 验证 form logic tree 的行为 | `form logic tree` |
| [gamePreviewCgDisplay.test.tsx](./gamePreviewCgDisplay.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 Editor formal preview CG lead-in 的行为 | `Editor formal preview CG lead-in` |
| [gamePreviewCharacterEffects.test.tsx](./gamePreviewCharacterEffects.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证静态/正式预览的背景、立绘缩放边界与人物特效组合 | `PreviewPanel`、`GamePreview`、`VisualStage` |
| [gamePreviewChoice.test.tsx](./gamePreviewChoice.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 GamePreview choices 的行为 | `GamePreview choices` |
| [gamePreviewVideoInput.test.tsx](./gamePreviewVideoInput.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 GamePreview video input 的行为 | `GamePreview video input` |
| [installApplicationMenu.test.ts](./installApplicationMenu.test.ts) | Vitest + TypeScript + Electron | 验证 application menu 的行为 | `application menu` |
| [logicBlockEvents.test.ts](./logicBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证 logic Blockly backend-first events 的行为 | `logic Blockly backend-first events` |
| [logicBlocks.test.ts](./logicBlocks.test.ts) | Vitest + TypeScript + Blockly | 验证逻辑/变量积木、动态操作数字段、空候选和孤立引用兼容 | `logic and variable Blockly definitions` |
| [logicStructure.test.ts](./logicStructure.test.ts) | Vitest + TypeScript | 验证 flat logic marker structure 的行为 | `flat logic marker structure` |
| [mediaPolicy.test.ts](./mediaPolicy.test.ts) | Vitest + TypeScript | 验证 MediaFormat、parseSingleByteRange 的行为 | `MediaFormat`、`parseSingleByteRange` |
| [preloadBundle.test.ts](./preloadBundle.test.ts) | Vitest + TypeScript | 验证 sandboxed preload bundle 的行为 | `sandboxed preload bundle` |
| [preloadEditorSettings.test.ts](./preloadEditorSettings.test.ts) | Vitest + TypeScript | 验证 preload Editor settings API 的行为 | `preload Editor settings API` |
| [preloadEngineApi.test.ts](./preloadEngineApi.test.ts) | Vitest + TypeScript | 验证 preload background and timeline engine API 的行为 | `preload background and timeline engine API` |
| [previewAudioController.test.ts](./previewAudioController.test.ts) | Vitest + TypeScript | 验证 preview audio controller 的行为 | `preview audio controller` |
| [previewPanelLogicNotice.test.tsx](./previewPanelLogicNotice.test.tsx) | Vitest + React + TypeScript | 验证 PreviewPanel logic uncertainty notice 的行为 | `PreviewPanel logic uncertainty notice` |
| [previewRuntime.test.ts](./previewRuntime.test.ts) | Vitest + TypeScript | 验证 game preview runtime 的行为 | `game preview runtime` |
| [previewVideo.test.tsx](./previewVideo.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 PreviewVideo 的行为 | `PreviewVideo` |
| [projectChoiceToWorkspace.test.ts](./projectChoiceToWorkspace.test.ts) | Vitest + TypeScript + Blockly | 验证 choice scene projection 的行为 | `choice scene projection` |
| [projectFileSession.test.ts](./projectFileSession.test.ts) | Vitest + TypeScript | 验证 ProjectFileSession logical save boundary 的行为 | `ProjectFileSession logical save boundary` |
| [projectSavePreparation.test.ts](./projectSavePreparation.test.ts) | Vitest + TypeScript | 验证 prepareProjectSave 的行为 | `prepareProjectSave` |
| [projectSessionPresentation.test.ts](./projectSessionPresentation.test.ts) | Vitest + TypeScript | 验证 project session presentation 的行为 | `project session presentation` |
| [projectStorageSession.test.ts](./projectStorageSession.test.ts) | Vitest + TypeScript | 验证 ProjectStorageSession 的行为 | `ProjectStorageSession` |
| [registerAssetIpc.test.ts](./registerAssetIpc.test.ts) | Vitest + TypeScript | 验证 asset IPC 的行为 | `asset IPC` |
| [registerEditorSettingsIpc.test.ts](./registerEditorSettingsIpc.test.ts) | Vitest + TypeScript | 验证 Editor settings IPC 的行为 | `Editor settings IPC` |
| [registerEngineIpc.test.ts](./registerEngineIpc.test.ts) | Vitest + TypeScript | 验证 engine IPC transaction boundary 的行为 | `engine IPC transaction boundary` |
| [registerExportIpc.test.ts](./registerExportIpc.test.ts) | Vitest + TypeScript | 验证 game export IPC 的行为 | `game export IPC` |
| [registerProjectFileIpc.test.ts](./registerProjectFileIpc.test.ts) | Vitest + TypeScript | 验证 project folder IPC 的行为 | `project folder IPC` |
| [rendererErrorBoundary.test.tsx](./rendererErrorBoundary.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 RendererErrorBoundary 的行为 | `RendererErrorBoundary` |
| [resourceBackgroundScale.test.tsx](./resourceBackgroundScale.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证场景初始背景缩放、清空归一化和标题页隐藏 | `ResourcePanel` |
| [runtimeBundleExporter.test.ts](./runtimeBundleExporter.test.ts) | Vitest + TypeScript | 验证 runtime bundle exporter 的行为 | `runtime bundle exporter` |
| [runtimeBundleFileProviderStability.test.ts](./runtimeBundleFileProviderStability.test.ts) | Vitest + TypeScript | 验证 runtime Bundle File Provider Stability 的关键行为与回归边界 | 关键成功、失败与边界场景 |
| [sceneJumpBlockEvents.test.ts](./sceneJumpBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证 scene jump Blockly field events 的行为 | `scene jump Blockly field events` |
| [sceneStartBlock.test.ts](./sceneStartBlock.test.ts) | Vitest + TypeScript + Blockly | 验证 scene start block 的行为 | `scene start block` |
| [standaloneApplicationArchive.test.ts](./standaloneApplicationArchive.test.ts) | Vitest + TypeScript | 验证 standalone Application Archive 的关键行为与回归边界 | 关键成功、失败与边界场景 |
| [standaloneApplicationExporter.test.ts](./standaloneApplicationExporter.test.ts) | Vitest + TypeScript | 验证 standalone Application Exporter 的关键行为与回归边界 | 关键成功、失败与边界场景 |
| [standaloneApplicationWindows.test.ts](./standaloneApplicationWindows.test.ts) | Vitest + TypeScript + PowerShell | 在 Windows x64 验证本地独立游戏的完整 ZIP 组装、复验与目录保留 | `standalone Windows x64 application export` |
| [standalonePlayerTemplate.test.ts](./standalonePlayerTemplate.test.ts) | Vitest + TypeScript | 验证 standalone Player template contract 的行为 | `standalone Player template contract` |
| [startScreenEditor.test.tsx](./startScreenEditor.test.tsx) | Vitest + React + TypeScript + Blockly + JSDOM | 验证 start screen Editor projection 的行为 | `start screen Editor projection` |
| [startScreenResponsiveStyle.test.ts](./startScreenResponsiveStyle.test.ts) | Vitest + TypeScript | 验证 start screen responsive style contract 的行为 | `start screen responsive style contract` |
| [storyBlockPagination.test.ts](./storyBlockPagination.test.ts) | Vitest + TypeScript + Blockly | 验证 story Blockly pagination 的行为 | `story Blockly pagination` |
| [storyBlockTypes.test.ts](./storyBlockTypes.test.ts) | Vitest + TypeScript | 验证 story block type registry 的行为 | `story block type registry` |
| [storyContinuationBlock.test.ts](./storyContinuationBlock.test.ts) | Vitest + TypeScript + Blockly | 验证 story continuation Blockly block 的行为 | `story continuation Blockly block` |
| [storyContinuationBlockEvents.test.ts](./storyContinuationBlockEvents.test.ts) | Vitest + TypeScript + Blockly | 验证 story continuation sequence commands 的行为 | `story continuation sequence commands` |
| [timelinePreview.test.ts](./timelinePreview.test.ts) | Vitest + TypeScript | 验证 deriveTimelinePreview 的行为 | `deriveTimelinePreview` |
| [titleModalStyle.test.ts](./titleModalStyle.test.ts) | Vitest + TypeScript | 验证 title preview modal visual style contract 的行为 | `title preview modal visual style contract` |
| [toolbarExport.test.tsx](./toolbarExport.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 Toolbar game export action 的行为 | `Toolbar game export action` |
| [useEditorSettings.test.tsx](./useEditorSettings.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 useEditorSettings 的行为 | `useEditorSettings` |
| [useEngineProject.test.tsx](./useEngineProject.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 useEngineProject asset state 的行为 | `useEngineProject asset state` |
| [useGamePreviewVideo.test.tsx](./useGamePreviewVideo.test.tsx) | Vitest + React + TypeScript + JSDOM | 验证 useGamePreview video transition 的行为 | `useGamePreview video transition` |
| [validateAssetInvocation.test.ts](./validateAssetInvocation.test.ts) | Vitest + TypeScript | 验证 asset IPC invocation validation 的行为 | `asset IPC invocation validation` |
| [validateEngineInvocation.test.ts](./validateEngineInvocation.test.ts) | Vitest + TypeScript | 验证 engine IPC validation 的行为 | `engine IPC validation` |
| [validateProjectFileInvocation.test.ts](./validateProjectFileInvocation.test.ts) | Vitest + TypeScript | 验证 project file IPC validation 的行为 | `project file IPC validation` |
| [videoBlock.test.ts](./videoBlock.test.ts) | Vitest + TypeScript + Blockly | 验证 video block asset slot 的行为 | `video block asset slot` |
| [viteRendererConfig.test.ts](./viteRendererConfig.test.ts) | Vitest + TypeScript | 验证 Vite Renderer dependency optimization 的行为 | `Vite Renderer dependency optimization` |
| [webPlayerExporter.test.ts](./webPlayerExporter.test.ts) | Vitest + TypeScript | 验证 Web Player ZIP exporter 的行为 | `Web Player ZIP exporter` |
| [webPlayerTemplate.test.ts](./webPlayerTemplate.test.ts) | Vitest + TypeScript | 验证 Web Player template contract 的行为 | `Web Player template contract` |
| [zoomControlIcons.test.ts](./zoomControlIcons.test.ts) | Vitest + TypeScript + JSDOM | 验证 inline Blockly zoom control icons 的行为 | `inline Blockly zoom control icons` |

## 开发与验证

- 测试文件尽量与被测模块同名，并断言公开行为；不要依赖用例顺序、固定用户目录或其他测试遗留状态。
- 定向运行示例：`pnpm --dir apps/editor exec vitest run tests/unit/timelinePreview.test.ts`；React/Blockly 用例可在文件名后追加 `-t "用例名称"` 缩小范围。
- 提交前结合改动范围运行全部 Vitest、`pnpm --dir apps/editor typecheck` 和 `pnpm --dir apps/editor lint`；真实后端链路使用上层 Integration 测试。
