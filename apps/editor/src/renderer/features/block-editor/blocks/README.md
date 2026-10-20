# Blockly 积木定义

[中文](./README.md) | [English](./README.en.md)

[返回 Blockly 故事编辑器](../README.md)

本目录定义故事编辑器可使用的 Blockly 积木、字段名称、连接类型和项目节点读写辅助函数。这里描述积木的形状与局部语义；创建、删除、重排等持久化操作由上一层工作区事件模块处理。

## 工作方式

1. 工作区启动时注册各类积木和自定义连接检查器，再根据当前语言应用标签与下拉选项。
2. 项目投影调用 `set*Block*` 辅助函数把作者节点写入稳定字段，资源名字段只截断显示、不改变真实值；背景与立绘缩放统一限制为 10%–300% 的整数。
3. 用户编辑字段或连接后，上一层事件解析器读取这些常量和访问器并生成 Engine 命令。

## 文件

| 文件 | 主要作用 |
| --- | --- |
| [assetNameField.ts](./assetNameField.ts) | 提供截断显示且点击可查看完整资源名的 Blockly 字段 |
| [backgroundBlock.ts](./backgroundBlock.ts) | 注册背景积木并读写资源、缩放和本地化标签，兼容 HMR 旧实例 |
| [bgmBlock.ts](./bgmBlock.ts) | 注册背景音乐积木并读写音频资源与播放参数 |
| [cgDisplayBlock.ts](./cgDisplayBlock.ts) | 注册可容纳对白的 CG 显示积木并读写图片与前置时长 |
| [characterBlock.ts](./characterBlock.ts) | 注册人物立绘和清除立绘积木并读写位置、图片与缩放，兼容 HMR 旧实例 |
| [characterEffectBlock.ts](./characterEffectBlock.ts) | 注册震动、跳跃、淡入淡出、滑入、呼吸和闪烁特效积木 |
| [choiceBlock.ts](./choiceBlock.ts) | 注册选项容器和分支积木并维护分支文本与目标场景 |
| [dialogueBlock.ts](./dialogueBlock.ts) | 注册对白积木并读写说话人、文本和语音资源 |
| [logicControlBlock.ts](./logicControlBlock.ts) | 注册条件和循环控制积木；If 变量操作数使用项目级可搜索选择器，常量操作数使用文本输入 |
| [searchableVariableDropdown.ts](./searchableVariableDropdown.ts) | 提供按变量名开头、忽略英文大小写筛选的变量选择弹层；查询文本不进入项目 |
| [sceneJumpBlock.ts](./sceneJumpBlock.ts) | 注册场景跳转积木并维护目标场景下拉选项 |
| [sceneStartBlock.ts](./sceneStartBlock.ts) | 注册不可删除的场景起点积木 |
| [storyContinuationBlock.ts](./storyContinuationBlock.ts) | 注册故事续页积木并维护页码序号 |
| [variableBlock.ts](./variableBlock.ts) | 注册变量新建/赋值积木，维护 If/Change 共用的项目级变量候选，并解析多类型逻辑值 |
| [videoBlock.ts](./videoBlock.ts) | 注册视频积木并读写视频资源和播放设置 |

## 开发与验证

- 积木类型、字段键和固定 ID 一旦进入保存布局就应保持稳定；资源为空必须有明确语义，不能依赖显示文本判断。
- 连接检查器要限制人物特效和 C 形对白等专用插槽，同时允许投影阶段可靠恢复合法树。
- 根据积木类型运行对应用例，例如 `pnpm --dir apps/editor exec vitest run tests/unit/characterEffectBlock.test.ts tests/unit/cgDisplayBlock.test.ts tests/unit/storyContinuationBlock.test.ts`。
