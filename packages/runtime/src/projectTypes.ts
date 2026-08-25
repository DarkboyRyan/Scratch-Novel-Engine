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

export type SceneNode =
  | DialogueNode
  | BackgroundNode
  | CharacterNode
  | SceneJumpNode
  | BgmNode
  | VideoNode
  | ChoiceNode;

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
