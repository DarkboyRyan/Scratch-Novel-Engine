/**
 * 文件主要作用：兼容导出运行时预览状态归约器和相关类型。
 * 包含实现：`advanceGamePreview`、`completeGamePreviewCgLeadIn`、`getGamePreviewChoices`、`selectGamePreviewChoice`、`startGamePreview`、`startGamePreviewAtScene` 等 7 项。
 */

// Compatibility surface for the Editor. The platform-independent reducer now
// lives in @vnengine/runtime and can be shared with the standalone Player.
export {
  advanceGame as advanceGamePreview,
  completeCgLeadIn as completeGamePreviewCgLeadIn,
  getChoices as getGamePreviewChoices,
  selectChoice as selectGamePreviewChoice,
  startGame as startGamePreview,
  startGameAtScene as startGamePreviewAtScene,
  type GameRuntime as GamePreviewRuntime,
  type RuntimeCharacterState,
} from '@vnengine/runtime';
