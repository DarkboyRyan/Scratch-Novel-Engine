# Player UI Source

[返回 Player UI](../README.md)

源码分为界面组件、媒体控制与宿主无关工具。所有组件都从 [`index.ts`](./index.ts) 选择性导出；消费方不应依赖未公开的内部实现。

## 组件关系

`PlayerUiProvider` 在顶层提供中英文标签和错误本地化，标题页、选项、CG 画廊、存档对话框与操作栏从 Context 读取相同文案。`TitleScreen` 组合作者配置的标题上方文字、游戏名、背景/BGM、开始或读取入口、选项和 CG Modal；`startScreen.eyebrow` 为空时不会渲染该行。Player 应用也可以把 Dialog 单独用于游戏内界面。

`VisualStage` 是纯舞台层，接收已经解析的背景、人物、对白与特效状态。人物资源为空时仍保留合法的“无立绘”状态；图片加载失败只影响对应视觉层。`PreviewVideo`、`usePreviewAudio` 和 `previewAudioController` 分别管理视频与 BGM/语音生命周期，并使用 `mediaVolume` 将主音量和通道音量合成。

## 交互与媒体约束

资源组件只认识 asset ID 与 `MediaUrlResolver`，URL 的安全性和生命周期由宿主负责。异步解析必须在 asset ID 或 resolver 变化时丢弃旧结果，避免切换游戏后显示上一会话媒体。音频/视频操作要处理浏览器自动播放拒绝、结束、错误与暂停，不能把失败 Promise 变成未处理异常。

Modal 组件需要维持初始焦点、Tab 焦点圈、Escape 关闭和触发按钮焦点恢复。新增文案必须同时补齐中英文；新增动效需提供可关闭或 reduced-motion 路径，并保持受控 props 不被组件内部静默持久化。

## 开发验证

```bash
pnpm --dir packages/player-ui typecheck
pnpm --dir apps/player exec vitest run \
  tests/unit/playerUiLocalization.test.tsx \
  tests/unit/playerMediaVolume.test.tsx \
  tests/unit/visualStageCharacterEffects.test.tsx
```

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
