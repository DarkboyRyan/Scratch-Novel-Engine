export {
  advanceGame,
  getChoices,
  selectChoice,
  startGame,
  startGameAtScene,
  type GameRuntime,
  type RuntimeCharacterState,
} from './gameRuntime';

export {
  createGameRuntimeSnapshot,
  GAME_RUNTIME_SNAPSHOT_VERSION,
  isGameRuntimeSnapshot,
  isSaveableGameRuntime,
  restoreGameRuntimeSnapshot,
  type GameRuntimeSnapshot,
  type SaveableGameRuntime,
} from './gameRuntimeSnapshot';

export type {
  BackgroundNode,
  BgmNode,
  CgGalleryDocument,
  CgGalleryPageDocument,
  CharacterNode,
  CharacterPosition,
  CharacterSlot,
  ChoiceNode,
  ChoiceOption,
  DialogueNode,
  ProjectDocument,
  SceneDocument,
  SceneJumpNode,
  SceneNode,
  StartScreenDocument,
  VideoNode,
} from './projectTypes';
