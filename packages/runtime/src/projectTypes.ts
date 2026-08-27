/**
 * 主要作用：定义平台无关的项目、场景节点、CG 与逻辑数据类型。
 * 关键函数与实现：`DialogueNode`、`BackgroundNode`、`CharacterSlot`、`CharacterPosition`；采用纯 TypeScript 状态转换与严格类型守卫，保持平台无关。
 */
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

export type CharacterEffectIntensity = 'subtle' | 'normal' | 'strong';

export type CharacterEffectDirection = 'left' | 'right' | 'up' | 'down';

export type CharacterEffect =
  | {
      type: 'shake' | 'jump' | 'breathe' | 'flash';
      durationMs: number;
      intensity: CharacterEffectIntensity;
    }
  | {
      type: 'fadeIn' | 'fadeOut';
      durationMs: number;
    }
  | {
      type: 'slideIn';
      durationMs: number;
      intensity: CharacterEffectIntensity;
      direction: CharacterEffectDirection;
    };

export type CharacterNode = {
  id: string;
  type: 'character';
  assetId: string | null;
  slot: CharacterSlot;
  layer: number;
  position: CharacterPosition | null;
  effect: CharacterEffect | null;
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

export type CgDisplayNode = {
  id: string;
  type: 'cgDisplay';
  assetId: string;
  leadInMs: number;
};

export type CgEndDisplayNode = {
  id: string;
  type: 'cgEndDisplay';
  cgDisplayNodeId: string;
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
  | CgDisplayNode
  | CgEndDisplayNode
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
