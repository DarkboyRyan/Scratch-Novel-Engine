# Player UI 源码

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

公共组件、Hook 和类型统一从 [`index.ts`](./index.ts) 导出。

- `PlayerUiProvider` 提供中英文标签与错误本地化。
- `TitleScreen`、`CgGallery`、`OptionsDialog`、`SaveSlotDialog` 和 `GameActionBar` 提供通用页面与交互。标题上方文字为空时隐藏；页面样式只映射为固定 CSS 变量和布局属性。
- `VisualStage` 展示已解析的背景、人物、对白和特效。缩放范围为 10%–300%：背景以中心为锚点，立绘以底部中心为锚点。默认人物位置为 `(20,100)`、`(50,100)`、`(80,100)`；自定义位置使用同一锚点。无立绘仍是合法状态，图片失败只影响对应图层。
- `PreviewVideo`、`usePreviewAudio` 和 `previewAudioController` 管理媒体生命周期；`mediaVolume` 合成主音量与通道音量；`useAutoFitScale` 适配容器尺寸。

## 交互约定

宿主负责 `MediaUrlResolver` 返回 URL 的安全性和生命周期。资源或 resolver 改变后丢弃旧异步结果，避免跨会话媒体残留。媒体操作需处理自动播放拒绝、结束、错误与暂停。

弹窗需支持初始焦点、Tab 焦点循环、Escape 关闭和关闭后焦点恢复。文案同时补齐中英文，动效提供关闭或 reduced-motion 路径。受控属性不在组件内自行持久化。

```sh
pnpm --dir packages/player-ui typecheck
pnpm --dir apps/player exec vitest run \
  tests/unit/playerUiLocalization.test.tsx \
  tests/unit/playerMediaVolume.test.tsx \
  tests/unit/visualStageCharacterEffects.test.tsx
```
