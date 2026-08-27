// 主要作用：在 Runtime DTO 上扩展 Editor 专用节点和作者资产模型。
// 关键实现：区分语义/隐藏节点，并通过 toRuntimeProjectDocument 降级运行时模型。
import type {
  CharacterNode as RuntimeCharacterNode,
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
  CgDisplayNode,
  CgEndDisplayNode,
  CgGalleryDocument,
  CgGalleryPageDocument,
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
  SceneJumpNode,
  StartScreenDocument,
  VariableChangeNode,
  VariableSetNode,
  VideoNode,
} from '@vnengine/runtime';

export type CharacterMode = 'show' | 'clear';

// Author v19 keeps an unresolved "show" node distinct from an intentional
// clear action. Runtime v9 deliberately remains unchanged: it still uses a
// nullable assetId, so this author-only discriminator must be removed at the
// projection boundary.
type CharacterNodeBase = Pick<
  RuntimeCharacterNode,
  'id' | 'type' | 'slot' | 'layer'
>;

export type CharacterNode =
  | (CharacterNodeBase & {
      mode: 'clear';
      assetId: null;
      position: null;
      effect: null;
    })
  | (CharacterNodeBase & {
      mode: 'show';
      assetId: null;
      position: RuntimeCharacterNode['position'];
      effect: null;
    })
  | (CharacterNodeBase & {
      mode: 'show';
      assetId: string;
      position: RuntimeCharacterNode['position'];
      effect: RuntimeCharacterNode['effect'];
    });

export type StoryExtensionNode = {
  id: string;
  type: 'storyExtension';
};

type RuntimeNonCharacterSceneNode = Exclude<
  RuntimeSceneNode,
  { type: 'character' }
>;

export type SemanticSceneNode = RuntimeNonCharacterSceneNode | CharacterNode;
export type HiddenLogicMarkerNode = Extract<
  RuntimeSceneNode,
  {
    type:
      | 'logicElse'
      | 'logicEndIf'
      | 'logicEndRepeat'
      | 'cgEndDisplay';
  }
>;
export type FormVisibleSceneNode = Exclude<
  SemanticSceneNode,
  HiddenLogicMarkerNode
>;
export type SceneNode = SemanticSceneNode | StoryExtensionNode;

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
    node.type === 'logicEndRepeat' ||
    node.type === 'cgEndDisplay';
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
      nodes: scene.nodes.flatMap((node): RuntimeSceneNode[] => {
        if (!isSemanticSceneNode(node)) {
          return [];
        }
        if (node.type !== 'character') {
          return [node];
        }

        const runtimeNode: RuntimeCharacterNode = {
          id: node.id,
          type: 'character',
          assetId: node.assetId,
          slot: node.slot,
          layer: node.layer,
          position: node.position,
          effect: node.effect,
        };
        if (node.mode === 'show') {
          // An unresolved authoring placeholder must be a preview no-op. If it
          // leaked through as assetId:null, Runtime v9 would interpret it as a
          // destructive clear-layer action. Export performs its own strict
          // validation and rejects this incomplete state before projection.
          return node.assetId === null ? [] : [runtimeNode];
        }

        return [{
          ...runtimeNode,
          assetId: null,
          position: null,
          effect: null,
        }];
      }),
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
