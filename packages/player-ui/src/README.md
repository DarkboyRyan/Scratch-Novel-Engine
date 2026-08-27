# Player UI Source

[返回 Player UI](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`CgGallery.tsx`](./CgGallery.tsx) | React | 九宫格分页、资源解析与灯箱 CG 浏览 | `CgGallery`、`useResolvedGalleryImages` |
| [`GameActionBar.tsx`](./GameActionBar.tsx) | React | 游戏内保存、读取、快进、选项和返回操作栏 | `GameActionBar`、pointer 快进事件 |
| [`OptionsDialog.tsx`](./OptionsDialog.tsx) | React | 语言、音量和显示设置对话框 | `OptionsDialog`、焦点圈、能力禁用 |
| [`PlayerUiProvider.tsx`](./PlayerUiProvider.tsx) | React Context | 提供语言、标签和本地化回调 | `PlayerUiProvider`、`usePlayerUiLabels` |
| [`PreviewVideo.tsx`](./PreviewVideo.tsx) | React、HTMLMediaElement | 解析播放视频并处理状态 | `PreviewVideo`、结束/错误/暂停回调 |
| [`SaveSlotDialog.tsx`](./SaveSlotDialog.tsx) | React | 展示和选择手动/快速存档槽 | `SaveSlotDialog`、`formatSaveTimestamp` |
| [`TitleScreen.tsx`](./TitleScreen.tsx) | React | 标题页入口、背景音乐和功能 Modal | `TitleScreen`、`useResolvedTitleAsset` |
| [`VisualStage.tsx`](./VisualStage.tsx) | React、CSS Animation | 背景、人物、对白和特效舞台 | `VisualStage`、`CharacterPortrait`、`effectStyle` |
| [`index.ts`](./index.ts) | TypeScript | 公共 API 聚合入口 | 组件、Hooks、类型再导出 |
| [`localization.ts`](./localization.ts) | TypeScript | 中英文标签和错误消息 | `PLAYER_UI_LABELS`、`normalizePlayerLanguage` |
| [`mediaPort.ts`](./mediaPort.ts) | TypeScript | 宿主无关媒体解析接口 | `MediaUrlResolver` |
| [`mediaVolume.ts`](./mediaVolume.ts) | TypeScript | 音量范围与通道合成 | `clampMediaVolume`、`effectiveMediaVolume` |
| [`previewAudioController.ts`](./previewAudioController.ts) | TypeScript、HTMLAudioElement | 管理 BGM/语音通道生命周期 | `createPreviewAudioController`、播放/暂停/切换 |
| [`useAutoFitScale.ts`](./useAutoFitScale.ts) | React、ResizeObserver | 计算和应用容器等比缩放 | `calculateAutoFitScale`、`useAutoFitScale` |
| [`usePreviewAudio.ts`](./usePreviewAudio.ts) | React Hook | 把 Runtime 音频状态接入控制器 | `usePreviewAudio` |
