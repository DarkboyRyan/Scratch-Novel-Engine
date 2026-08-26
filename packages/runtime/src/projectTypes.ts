// These DTOs describe the platform-independent story data consumed by the
// runtime. They intentionally contain no storage paths, Electron values, DOM
// objects, or editor commands.
export type DialogueNode = {
  id: string;
  type: 'dialogue';
  speaker: string;
  text: string;
  voiceAssetId: string | null;
};

export type BackgroundNode = {
  id: string;
  type: 'background';
  assetId: string | null;
};

export type CharacterSlot = 'left' | 'center' | 'right';

export type CharacterPosition = {
  x: number;
  y: number;
};

export type CharacterNode = {
  id: string;
  type: 'character';
  assetId: string | null;
  slot: CharacterSlot;
  layer: number;
  position: CharacterPosition | null;
};

export type SceneJumpNode = {
  id: string;
  type: 'sceneJump';
  targetSceneId: string;
};

export type BgmNode = {
  id: string;
  type: 'bgm';
  assetId: string | null;
};

export type VideoNode = {
  id: string;
  type: 'video';
  assetId: string | null;
};

export type ChoiceOption = {
  id: string;
  text: string;
  targetSceneId: string;
};

export type ChoiceNode = {
  id: string;
  type: 'choice';
  options: ChoiceOption[];
};

export type LogicValue = boolean | number | string;

export type LogicOperand =
  | { kind: 'variable'; name: string }
  | { kind: 'literal'; value: LogicValue };

export type LogicComparisonOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type LogicCondition = {
  left: LogicOperand;
  operator: LogicComparisonOperator;
  right: LogicOperand;
};

export type VariableSetNode = {
  id: string;
  type: 'variableSet';
  variableName: string;
  value: LogicValue;
};

export type VariableChangeNode = {
  id: string;
  type: 'variableChange';
  variableName: string;
  amount: number;
};

export type LogicIfNode = {
  id: string;
  type: 'logicIf';
  condition: LogicCondition;
};

export type LogicElseNode = {
  id: string;
  type: 'logicElse';
  ifNodeId: string;
};

export type LogicEndIfNode = {
  id: string;
  type: 'logicEndIf';
  ifNodeId: string;
};

export type LogicRepeatNode = {
  id: string;
  type: 'logicRepeat';
  count: number;
};

export type LogicEndRepeatNode = {
  id: string;
  type: 'logicEndRepeat';
  repeatNodeId: string;
};

export type SceneNode =
  | DialogueNode
  | BackgroundNode
  | CharacterNode
  | SceneJumpNode
  | BgmNode
  | VideoNode
  | ChoiceNode
  | VariableSetNode
  | VariableChangeNode
  | LogicIfNode
  | LogicElseNode
  | LogicEndIfNode
  | LogicRepeatNode
  | LogicEndRepeatNode;

export type SceneDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  backgroundAssetId: string | null;
  nodes: SceneNode[];
};

export type StartScreenDocument = {
  title: string;
  backgroundAssetId: string | null;
  musicAssetId: string | null;
};

export type CgGalleryPageDocument = {
  imageAssetIds: Array<string | null>;
};

export type CgGalleryDocument = {
  pages: CgGalleryPageDocument[];
};

export type ProjectDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  entrySceneId: string;
  startScreen: StartScreenDocument;
  cgGallery: CgGalleryDocument;
  scenes: SceneDocument[];
};
