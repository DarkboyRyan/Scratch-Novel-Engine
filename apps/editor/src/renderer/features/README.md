# 功能模块

[返回 Renderer](../README.md)

Features 按用户能够感知的创作能力组织 Renderer 代码，而不是按 React 文件类型分组。每个模块可以包含自己的组件、投影逻辑和事件转换，但共享创作动作、媒体端口与本地化仍来自上层目录。

## 架构位置与工作方式

1. `App` 根据当前编辑界面选择标题、CG 画廊、表单故事或 Blockly 故事 Feature。
2. Feature 将作者工程投影成适合当前 UI 的状态，并把编辑事件转换为 Application 层动作。
3. Engine 返回新工程后 Feature 重建投影，静态预览或正式运行预览随之更新。

## 子目录

| 目录 | 主要作用 |
| --- | --- |
| [assets](./assets/README.md) | 项目媒体资源的展示、拖拽和预览能力。 |
| [block-editor](./block-editor/README.md) | 故事 Blockly 编辑器的工作区、事件同步和布局能力。 |
| [cg-gallery](./cg-gallery/README.md) | CG 画廊的表单、Blockly 编辑和项目投影。 |
| [form-editor](./form-editor/README.md) | 传统表单模式的场景、时间线和节点属性编辑。 |
| [game-preview](./game-preview/README.md) | 编辑器内正式运行预览及共享播放器适配。 |
| [start-screen](./start-screen/README.md) | 标题界面的表单、Blockly 编辑和界面导航。 |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| — | — | 本目录仅用于组织子模块 | 参见上方子目录 |

## 开发与验证

- 业务状态的权威来源始终是作者工程；临时草稿和选中项可以留在 Feature，但提交后必须由新投影校准。
- 跨模块能力优先上移到 [`../application/`](../application/README.md)、[`../components/`](../components/README.md) 或 [`../hooks/`](../hooks/README.md)，避免相互反向依赖。
- 修改某个 Feature 时运行其对应的单元/交互测试，并至少完成 `pnpm --dir apps/editor typecheck`。
