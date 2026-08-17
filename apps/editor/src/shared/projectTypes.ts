// Story DTOs are owned by the platform-independent runtime package. This file
// remains as a compatibility boundary for existing Editor imports.
export type {
  BackgroundNode,
  BgmNode,
  CharacterNode,
  CharacterSlot,
  ChoiceNode,
  ChoiceOption,
  DialogueNode,
  ProjectDocument,
  SceneDocument,
  SceneJumpNode,
  SceneNode,
  VideoNode,
} from '@vnengine/runtime';

// Renderer receives only UI-safe metadata. Main/C++ keep every absolute and
// project-relative storage path private to the trusted persistence boundary.
export type AssetDocument = {
  id: string;
  type: 'image' | 'video' | 'audio';
  displayName: string;
};
