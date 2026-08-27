# 游戏预览

[返回功能模块](../README.md)

本目录在 Editor 内运行接近正式 Player 的剧情预览，覆盖对白、选项、CG、音视频和人物特效。它复用 Runtime 与 Player UI 契约，但使用 Editor 的受控媒体解析和预览会话，因此不会绕过未保存工程或启动独立应用。

## 架构位置与工作方式

1. 上层把当前作者工程编译或投影成预览可接受的数据，并选择从项目开头或指定场景启动。
2. `useGamePreview.ts` 和 `previewRuntime.ts` 维护会话、推进对白、等待 CG 前置时长并处理选择分支。
3. `GamePreview.tsx` 使用共享 Player 视觉组件渲染状态，音频控制器与视频组件再把媒体事件反馈给会话。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [GamePreview.tsx](./GamePreview.tsx) | React + TypeScript | 呈现正式游戏预览并驱动对白、选项、CG、视频和角色特效 | `GamePreview` |
| [previewAudioController.ts](./previewAudioController.ts) | TypeScript | 兼容导出共享播放器 UI 的预览音频控制器 | `createPreviewAudioController` |
| [previewRuntime.ts](./previewRuntime.ts) | TypeScript | 兼容导出运行时预览状态归约器和相关类型 | `advanceGamePreview`、`completeGamePreviewCgLeadIn`、`getGamePreviewChoices`、`selectGamePreviewChoice`、`startGamePreview`、`startGamePreviewAtScene` 等 7 项 |
| [PreviewVideo.tsx](./PreviewVideo.tsx) | React + TypeScript | 兼容导出共享播放器 UI 的视频预览组件 | `PreviewVideo` |
| [useGamePreview.ts](./useGamePreview.ts) | TypeScript | 创建并维护编辑器内游戏预览会话状态 | `GamePreviewSession`、`useGamePreview` |
| [usePreviewAudio.ts](./usePreviewAudio.ts) | TypeScript | 兼容导出共享播放器 UI 的预览音频 Hook | `usePreviewAudio` |

## 开发与验证

- Editor 预览与正式 Runtime 的推进语义必须一致；只允许在媒体网关和宿主控制层存在差异。
- 计时、音视频回调和人物特效要支持暂停、卸载清理与 reduced-motion，避免旧会话事件推进新预览。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/previewRuntime.test.ts tests/unit/gamePreviewChoice.test.tsx tests/unit/gamePreviewCgDisplay.test.tsx tests/unit/gamePreviewCharacterEffects.test.tsx`。
