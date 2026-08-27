# 游戏预览

编辑器内正式运行预览及共享播放器适配。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [GamePreview.tsx](./GamePreview.tsx) | React + TypeScript | 呈现正式游戏预览并驱动对白、选项、CG、视频和角色特效 | `GamePreview` |
| [previewAudioController.ts](./previewAudioController.ts) | TypeScript | 兼容导出共享播放器 UI 的预览音频控制器 | `createPreviewAudioController` |
| [previewRuntime.ts](./previewRuntime.ts) | TypeScript | 兼容导出运行时预览状态归约器和相关类型 | `advanceGamePreview`、`completeGamePreviewCgLeadIn`、`getGamePreviewChoices`、`selectGamePreviewChoice`、`startGamePreview`、`startGamePreviewAtScene` 等 7 项 |
| [PreviewVideo.tsx](./PreviewVideo.tsx) | React + TypeScript | 兼容导出共享播放器 UI 的视频预览组件 | `PreviewVideo` |
| [useGamePreview.ts](./useGamePreview.ts) | TypeScript | 创建并维护编辑器内游戏预览会话状态 | `GamePreviewSession`、`useGamePreview` |
| [usePreviewAudio.ts](./usePreviewAudio.ts) | TypeScript | 兼容导出共享播放器 UI 的预览音频 Hook | `usePreviewAudio` |
