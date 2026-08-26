import type {
  ProjectDocument as RuntimeProjectDocument,
  SceneDocument as RuntimeSceneDocument,
  SceneNode as RuntimeSceneNode,
} from '@vnengine/runtime';

// Runtime DTOs remain platform-independent. The Editor adds authoring-only
// nodes at this boundary so layout controls can be persisted without ever
// becoming executable game commands.
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
  LogicComparisonOperator,
  LogicCondition,
  LogicElseNode,
  LogicEndIfNode,
  LogicEndRepeatNode,
  LogicIfNode,
  LogicOperand,
  LogicRepeatNode,
  LogicValue,
  SceneJumpNode,
  StartScreenDocument,
  VariableChangeNode,
  VariableSetNode,
  VideoNode,
} from '@vnengine/runtime';

export type StoryExtensionNode = {
  id: string;
  type: 'storyExtension';
};

export type SemanticSceneNode = RuntimeSceneNode;
export type HiddenLogicMarkerNode = Extract<
  RuntimeSceneNode,
  { type: 'logicElse' | 'logicEndIf' | 'logicEndRepeat' }
>;
export type FormVisibleSceneNode = Exclude<
  RuntimeSceneNode,
  HiddenLogicMarkerNode
>;
export type SceneNode = RuntimeSceneNode | StoryExtensionNode;

export type SceneDocument = Omit<RuntimeSceneDocument, 'nodes'> & {
  nodes: SceneNode[];
};

export type ProjectDocument = Omit<RuntimeProjectDocument, 'scenes'> & {
  scenes: SceneDocument[];
};

export function isStoryExtensionNode(
  node: SceneNode,
): node is StoryExtensionNode {
  return node.type === 'storyExtension';
}

export function isSemanticSceneNode(
  node: SceneNode,
): node is SemanticSceneNode {
  return node.type !== 'storyExtension';
}

export function semanticSceneNodes(
  scene: Pick<SceneDocument, 'nodes'>,
): SemanticSceneNode[] {
  return scene.nodes.filter(isSemanticSceneNode);
}

export function isHiddenLogicMarkerNode(
  node: SceneNode,
): node is HiddenLogicMarkerNode {
  return node.type === 'logicElse' ||
    node.type === 'logicEndIf' ||
    node.type === 'logicEndRepeat';
}

export function formVisibleSceneNodes(
  scene: Pick<SceneDocument, 'nodes'>,
): FormVisibleSceneNode[] {
  return scene.nodes.filter(
    (node): node is FormVisibleSceneNode =>
      node.type !== 'storyExtension' && !isHiddenLogicMarkerNode(node),
  );
}

export function toRuntimeProjectDocument(
  project: ProjectDocument,
): RuntimeProjectDocument {
  return {
    schemaVersion: project.schemaVersion,
    id: project.id,
    name: project.name,
    entrySceneId: project.entrySceneId,
    startScreen: project.startScreen,
    cgGallery: project.cgGallery ?? {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
    },
    scenes: project.scenes.map((scene) => ({
      schemaVersion: scene.schemaVersion,
      id: scene.id,
      name: scene.name,
      backgroundAssetId: scene.backgroundAssetId,
      nodes: scene.nodes.filter(isSemanticSceneNode),
    })),
  };
}

// Renderer receives only UI-safe metadata. Main/C++ keep every absolute and
// project-relative storage path private to the trusted persistence boundary.
export type AssetDocument = {
  id: string;
  type: 'image' | 'video' | 'audio';
  displayName: string;
};
