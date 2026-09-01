/**
 * 主要作用：集中导出 Runtime 的公共执行函数、快照契约和项目类型。
 * 关键函数与实现：Runtime 公共 API 转发；采用纯 TypeScript 状态转换与严格类型守卫，保持平台无关。
 */
export {
  advanceGame,
  completeCgLeadIn,
  compileSceneControlFlow,
  getChoices,
  getLocalizedRuntimeErrorMessage,
  selectChoice,
  startGame,
  startGameAtScene,
  validateSceneControlFlow,
  type GameRuntime,
  type RuntimeCharacterState,
  type RuntimeErrorCode,
  type RuntimeLoopFrame,
  type RuntimeVariables,
} from './gameRuntime';

export {
  areGameRuntimeSnapshotsEqual,
  createGameRuntimeSnapshot,
  GAME_RUNTIME_SNAPSHOT_VERSION,
  isGameRuntimeSnapshot,
  isSaveableGameRuntime,
  restoreGameRuntimeSnapshot,
  type GameRuntimeSnapshot,
  type CurrentGameRuntimeSnapshot,
  type CgGameRuntimeSnapshot,
  type EffectGameRuntimeSnapshot,
  type EffectRuntimeCharacterSnapshot,
  type LegacyGameRuntimeSnapshot,
  type LegacyRuntimeCharacterSnapshot,
  type LogicGameRuntimeSnapshot,
  type RuntimeCharacterSnapshot,
  type SaveableGameRuntime,
} from './gameRuntimeSnapshot';

export {
  isLogicCondition,
  isLogicOperand,
  isLogicValue,
  isLogicVariableName,
  MAX_AUTOMATIC_STEPS_PER_ADVANCE,
  MAX_LOGIC_NESTING_DEPTH,
  MAX_LOGIC_STRING_BYTES,
  MAX_REPEAT_COUNT,
  MAX_RUNTIME_VARIABLE_BYTES,
  MAX_RUNTIME_VARIABLES,
  MAX_VARIABLE_NAME_BYTES,
  projectLogicVariableNames,
  utf8ByteLength,
  validateProjectLogicVariableBudget,
} from './logicValidation';

export { MAX_CG_LEAD_IN_MS } from './gameRuntime';

export {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isImageScalePercent,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
} from './imageScale';

export type {
  BackgroundNode,
  BgmNode,
  CgDisplayNode,
  CgEndDisplayNode,
  CgGalleryDocument,
  CgGalleryPageDocument,
  CharacterNode,
  CharacterEffect,
  CharacterEffectDirection,
  CharacterEffectIntensity,
  CharacterPosition,
  CharacterSlot,
  ChoiceNode,
  ChoiceOption,
  DialogueNode,
  LogicComparisonOperator,
  LogicCondition,
  LogicElseNode,
  LogicEndIfNode,
  LogicEndRepeatNode,
  LogicIfNode,
  LogicOperand,
  LogicRepeatNode,
  LogicValue,
  ProjectDocument,
  SceneDocument,
  SceneJumpNode,
  SceneNode,
  StartScreenDocument,
  VariableChangeNode,
  VariableSetNode,
  VideoNode,
} from './projectTypes';

export {
  isCharacterEffect,
  MAX_CHARACTER_EFFECT_DURATION_MS,
  MIN_CHARACTER_EFFECT_DURATION_MS,
} from './characterEffect';
