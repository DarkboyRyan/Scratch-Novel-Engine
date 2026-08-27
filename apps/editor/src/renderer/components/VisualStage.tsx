/**
 * 文件主要作用：兼容导出共享播放器 UI 中的视觉舞台组件。
 * 包含实现：`VisualStage`。
 */

// Compatibility entry point for Editor features. The implementation lives in
// the reusable Player UI package shared with the future standalone Player.
export {
  VisualStage,
  type PreviewCharacter,
  type VisualStageProps,
} from '@vnengine/player-ui';
