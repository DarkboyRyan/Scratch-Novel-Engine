# Blockly 积木定义

故事编辑器中各类 Blockly 积木的定义与字段读写。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [assetNameField.ts](./assetNameField.ts) | TypeScript + Blockly | 提供截断显示且点击可查看完整资源名的 Blockly 字段 | `ASSET_NAME_MAX_DISPLAY_LENGTH`、`limitAssetFieldDisplay`、`AssetNameField` |
| [backgroundBlock.ts](./backgroundBlock.ts) | TypeScript + Blockly | 注册背景积木并读写背景资源和本地化标签 | `BACKGROUND_BLOCK_TYPE`、`BACKGROUND_BLOCK_FIELDS`、`applyBackgroundBlockLocalization`、`setBackgroundBlockAsset`、`getBackgroundBlockAssetId`、`registerBackgroundBlock` |
| [bgmBlock.ts](./bgmBlock.ts) | TypeScript + Blockly | 注册背景音乐积木并读写音频资源与播放参数 | `BGM_BLOCK_TYPE`、`BGM_BLOCK_FIELDS`、`applyBgmBlockLocalization`、`setBgmBlockAsset`、`getBgmBlockAssetId`、`registerBgmBlock` |
| [cgDisplayBlock.ts](./cgDisplayBlock.ts) | TypeScript + Blockly | 注册可容纳对白的 CG 显示积木并读写图片与前置时长 | `CG_DISPLAY_BLOCK_TYPE`、`CG_DISPLAY_INPUTS`、`CG_DISPLAY_FIELDS`、`CgDisplayMarkers`、`setCgDisplayImageOptions`、`setCgDisplayBlockNode` 等 11 项 |
| [characterBlock.ts](./characterBlock.ts) | TypeScript + Blockly | 注册人物立绘和清除立绘积木并读写位置与图片资源 | `CHARACTER_BLOCK_TYPE`、`CLEAR_CHARACTER_BLOCK_TYPE`、`CHARACTER_BLOCK_FIELDS`、`CHARACTER_BLOCK_INPUTS`、`applyCharacterBlockLocalization`、`setCharacterBlockAsset` 等 12 项 |
| [characterEffectBlock.ts](./characterEffectBlock.ts) | TypeScript + Blockly | 注册震动、跳跃、淡入淡出、滑入、呼吸和闪烁特效积木 | `CHARACTER_EFFECT_CONNECTION_TYPE`、`CHARACTER_EFFECT_BLOCK_TYPES`、`CharacterEffectBlockType`、`CHARACTER_EFFECT_FIELDS`、`CharacterEffectConnectionChecker`、`isCharacterEffectBlockType` 等 14 项 |
| [choiceBlock.ts](./choiceBlock.ts) | TypeScript + Blockly | 注册选项容器和分支积木并维护分支文本与目标场景 | `CHOICE_BLOCK_TYPE`、`CHOICE_OPTION_BLOCK_TYPE`、`CHOICE_OPTION_CONNECTION_TYPE`、`CHOICE_BLOCK_INPUTS`、`CHOICE_OPTION_BLOCK_FIELDS`、`applyChoiceBlockLocalization` 等 8 项 |
| [dialogueBlock.ts](./dialogueBlock.ts) | TypeScript + Blockly | 注册对白积木并读写说话人、文本和语音资源 | `DIALOGUE_BLOCK_TYPE`、`DIALOGUE_BLOCK_FIELDS`、`applyDialogueBlockLocalization`、`setDialogueBlockVoice`、`getDialogueBlockVoiceAssetId`、`registerDialogueBlock` |
| [logicControlBlock.ts](./logicControlBlock.ts) | TypeScript + Blockly | 注册条件和循环控制积木及嵌套语句插槽 | `LOGIC_IF_BLOCK_TYPE`、`LOGIC_REPEAT_BLOCK_TYPE`、`LOGIC_CONTROL_INPUTS`、`LOGIC_CONTROL_FIELDS`、`LogicControlMarkers`、`readLogicIfBlock` 等 12 项 |
| [sceneJumpBlock.ts](./sceneJumpBlock.ts) | TypeScript + Blockly | 注册场景跳转积木并维护目标场景下拉选项 | `SCENE_JUMP_BLOCK_TYPE`、`SCENE_JUMP_BLOCK_FIELDS`、`applySceneJumpBlockLocalization`、`setSceneJumpBlockOptions`、`registerSceneJumpBlock` |
| [sceneStartBlock.ts](./sceneStartBlock.ts) | TypeScript + Blockly | 注册不可删除的场景起点积木 | `SCENE_START_BLOCK_TYPE`、`applySceneStartBlockLocalization`、`getSceneStartBlockId`、`registerSceneStartBlock` |
| [storyContinuationBlock.ts](./storyContinuationBlock.ts) | TypeScript + Blockly | 注册故事续页积木并维护页码序号 | `STORY_CONTINUATION_BLOCK_TYPE`、`STORY_CONTINUATION_BLOCK_FIELDS`、`applyStoryContinuationBlockLocalization`、`getStoryContinuationBlockSequence`、`setStoryContinuationBlockSequence`、`registerStoryContinuationBlock` |
| [variableBlock.ts](./variableBlock.ts) | TypeScript + Blockly | 注册变量赋值和增减积木并解析多类型逻辑值 | `VARIABLE_SET_BLOCK_TYPE`、`VARIABLE_CHANGE_BLOCK_TYPE`、`VARIABLE_BLOCK_FIELDS`、`LogicValueType`、`getLogicValueType`、`parseLogicValue` 等 12 项 |
| [videoBlock.ts](./videoBlock.ts) | TypeScript + Blockly | 注册视频积木并读写视频资源和播放设置 | `VIDEO_BLOCK_TYPE`、`VIDEO_BLOCK_FIELDS`、`applyVideoBlockLocalization`、`setVideoBlockAsset`、`getVideoBlockAssetId`、`registerVideoBlock` |
