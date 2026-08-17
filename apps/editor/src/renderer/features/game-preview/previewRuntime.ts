// Compatibility surface for the Editor. The platform-independent reducer now
// lives in @vnengine/runtime and can be shared with the standalone Player.
export {
  advanceGame as advanceGamePreview,
  getChoices as getGamePreviewChoices,
  selectChoice as selectGamePreviewChoice,
  startGame as startGamePreview,
  type GameRuntime as GamePreviewRuntime,
  type RuntimeCharacterState,
} from '@vnengine/runtime';
