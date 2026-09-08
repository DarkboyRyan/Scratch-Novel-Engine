// 主要作用：在 Runtime DTO 上扩展 Editor 专用节点和作者资产模型。
// 关键实现：复用 Runtime 缩放契约、区分语义/隐藏节点并投影运行时模型。
import {
  DEFAULT_CG_GALLERY_STYLE,
  type BackgroundNode as RuntimeBackgroundNode,
  type CharacterEffect,
  type CharacterNode as RuntimeCharacterNode,
  type CharacterPosition,
  type CharacterSlot,
  type LogicCondition,
  type LogicValue,
  type ProjectDocument as RuntimeProjectDocument,
  type SceneDocument as RuntimeSceneDocument,
  type SceneNode as RuntimeSceneNode,
} from '@vnengine/runtime';

export const DEFAULT_START_SCREEN_EYEBROW = 'A VN ENGINE STORY';
export const START_SCREEN_EYEBROW_MAX_UTF8_BYTES = 256;
export {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_IMAGE_SCALE_PERCENT,
  DEFAULT_START_SCREEN_STYLE,
  isCgGalleryStyleDocument,
  isImageScalePercent,
  isStartScreenStyleDocument,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
} from '@vnengine/runtime';

// Runtime DTOs remain platform-independent. The Editor adds authoring-only
// nodes at this boundary so layout controls can be persisted without ever
// becoming executable game commands.
export type {
  BgmNode,
  CgDisplayNode,
  CgEndDisplayNode,
  CgGalleryDocument,
  CgGalleryPageDocument,
  CgGalleryStyleDocument,
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
  StartScreenStyleDocument,
  PageFontPreset,
  VariableChangeNode,
  VariableSetNode,
  VideoNode,
} from '@vnengine/runtime';

export type CharacterMode = 'show' | 'clear';

export type BackgroundNode = RuntimeBackgroundNode & {
  scalePercent: number;
};

// Author v19 keeps an unresolved "show" node distinct from an intentional
// clear action. Runtime v12 still uses a nullable assetId for the command, so
// this author-only discriminator must be removed at the projection boundary.
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
      scalePercent: number;
    })
  | (CharacterNodeBase & {
      mode: 'show';
      assetId: null;
      position: RuntimeCharacterNode['position'];
      effect: null;
      scalePercent: number;
    })
  | (CharacterNodeBase & {
      mode: 'show';
      assetId: string;
      position: RuntimeCharacterNode['position'];
      effect: RuntimeCharacterNode['effect'];
      scalePercent: number;
    });

export type StoryExtensionNode = {
  id: string;
  type: 'storyExtension';
};

type RuntimeNonScalableImageSceneNode = Exclude<
  RuntimeSceneNode,
  { type: 'background' | 'character' }
>;

export type SemanticSceneNode =
  | RuntimeNonScalableImageSceneNode
  | BackgroundNode
  | CharacterNode;
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
  backgroundScalePercent: number;
  nodes: SceneNode[];
};

// The editable story Code surface compiles into this closed, format-neutral
// draft before crossing IPC. `originId` is only an identity hint for an
// existing authored object; omitted IDs are allocated by the C++ backend.
// Hidden logic/CG markers never cross this boundary and are rebuilt from the
// nested controls during the atomic scene replacement.
type SceneContentDraftOrigin = {
  originId?: string;
};

export type SceneContentDialogueDraft = SceneContentDraftOrigin & {
  type: 'dialogue';
  speaker: string;
  text: string;
  voiceAssetId: string | null;
};

export type SceneContentChoiceOptionDraft = SceneContentDraftOrigin & {
  text: string;
  targetSceneId: string;
};

export type SceneContentDraftNode =
  | SceneContentDialogueDraft
  | (SceneContentDraftOrigin & {
      type: 'background';
      assetId: string | null;
      scalePercent: number;
    })
  | (SceneContentDraftOrigin & {
      type: 'character';
      mode: CharacterMode;
      assetId: string | null;
      slot: CharacterSlot;
      layer: number;
      position: CharacterPosition | null;
      effect: CharacterEffect | null;
      scalePercent: number;
    })
  | (SceneContentDraftOrigin & {
      type: 'sceneJump';
      targetSceneId: string;
    })
  | (SceneContentDraftOrigin & {
      type: 'bgm';
      assetId: string | null;
    })
  | (SceneContentDraftOrigin & {
      type: 'video';
      assetId: string | null;
    })
  | (SceneContentDraftOrigin & {
      type: 'choice';
      options: SceneContentChoiceOptionDraft[];
    })
  | (SceneContentDraftOrigin & {
      type: 'variableSet';
      variableName: string;
      value: LogicValue;
    })
  | (SceneContentDraftOrigin & {
      type: 'variableChange';
      variableName: string;
      amount: number;
    })
  | (SceneContentDraftOrigin & {
      type: 'if';
      condition: LogicCondition;
      thenNodes: SceneContentDraftNode[];
      elseNodes: SceneContentDraftNode[];
    })
  | (SceneContentDraftOrigin & {
      type: 'repeat';
      count: number;
      bodyNodes: SceneContentDraftNode[];
    })
  | (SceneContentDraftOrigin & {
      type: 'cg';
      assetId: string;
      leadInMs: number;
      bodyNodes: SceneContentDialogueDraft[];
    })
  | (SceneContentDraftOrigin & {
      type: 'storyExtension';
    });

export type SceneContentDraft = {
  name: string;
  initialBackground: {
    assetId: string | null;
    scalePercent: number;
  };
  nodes: SceneContentDraftNode[];
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
      style: { ...DEFAULT_CG_GALLERY_STYLE },
    },
    scenes: project.scenes.map((scene) => ({
      schemaVersion: scene.schemaVersion,
      id: scene.id,
      name: scene.name,
      backgroundAssetId: scene.backgroundAssetId,
      backgroundScalePercent: scene.backgroundScalePercent,
      nodes: scene.nodes.flatMap((node): RuntimeSceneNode[] => {
        if (!isSemanticSceneNode(node)) {
          return [];
        }
        if (node.type !== 'character') {
          return [node];
        }

        const runtimeNode: RuntimeCharacterNode & { scalePercent: number } = {
          id: node.id,
          type: 'character',
          assetId: node.assetId,
          slot: node.slot,
          layer: node.layer,
          position: node.position,
          effect: node.effect,
          scalePercent: node.scalePercent,
        };
        if (node.mode === 'show') {
          // An unresolved authoring placeholder must be a preview no-op. If it
          // leaked through as assetId:null, Runtime would interpret it as a
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
