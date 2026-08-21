import { BACKGROUND_BLOCK_TYPE } from './blocks/backgroundBlock';
import { BGM_BLOCK_TYPE } from './blocks/bgmBlock';
import {
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
} from './blocks/characterBlock';
import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';
import { SCENE_JUMP_BLOCK_TYPE } from './blocks/sceneJumpBlock';
import { VIDEO_BLOCK_TYPE } from './blocks/videoBlock';
import { CHOICE_BLOCK_TYPE } from './blocks/choiceBlock';
import { STORY_CONTINUATION_BLOCK_TYPE } from './blocks/storyContinuationBlock';

// Every generic timeline behavior (selection, layout, delete and reorder)
// must use this one registry. A new SceneNode block should never be added to
// only one interaction path.
export const STORY_BLOCK_TYPES = [
  DIALOGUE_BLOCK_TYPE,
  BACKGROUND_BLOCK_TYPE,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  SCENE_JUMP_BLOCK_TYPE,
  BGM_BLOCK_TYPE,
  VIDEO_BLOCK_TYPE,
  CHOICE_BLOCK_TYPE,
  STORY_CONTINUATION_BLOCK_TYPE,
] as const;

export function isStoryBlockType(type: string): boolean {
  return (STORY_BLOCK_TYPES as readonly string[]).includes(type);
}
