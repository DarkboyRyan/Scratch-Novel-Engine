import { describe, expect, it } from 'vitest';

import { BGM_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/bgmBlock';
import { BACKGROUND_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import {
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import { SCENE_JUMP_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/sceneJumpBlock';
import { VIDEO_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/videoBlock';
import {
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import { STORY_CONTINUATION_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/storyContinuationBlock';
import {
  isStoryBlockType,
  STORY_BLOCK_TYPES,
} from '../../src/renderer/features/block-editor/storyBlockTypes';
import { createBlockEditorToolbox } from '../../src/renderer/features/block-editor/toolbox';

describe('story block type registry', () => {
  it('includes every non-dialogue story node in generic interactions', () => {
    expect(STORY_BLOCK_TYPES).toContain(BGM_BLOCK_TYPE);
    expect(STORY_BLOCK_TYPES).toContain(VIDEO_BLOCK_TYPE);
    expect(STORY_BLOCK_TYPES).toContain(CHOICE_BLOCK_TYPE);
    expect(STORY_BLOCK_TYPES).toContain(CLEAR_CHARACTER_BLOCK_TYPE);
    expect(isStoryBlockType(BGM_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType(VIDEO_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType(CHOICE_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType(CLEAR_CHARACTER_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType(CHOICE_OPTION_BLOCK_TYPE)).toBe(false);
    expect(isStoryBlockType(STORY_CONTINUATION_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType('unrelated-block')).toBe(false);
  });

  it('groups toolbox blocks into story, music and image modules', () => {
    const toolbox = createBlockEditorToolbox();
    const categories = (
      toolbox as unknown as {
        contents: Array<{
          name: string;
          contents: Array<{ type?: string }>;
        }>;
      }
    ).contents;
    const typesIn = (name: string) =>
      categories
        .find((category) => category.name === name)
        ?.contents.map((item) => item.type) ?? [];

    expect(categories.map((category) => category.name)).toEqual([
      '剧情',
      '音乐',
      '图片',
    ]);
    expect(typesIn('剧情')).toEqual([
      DIALOGUE_BLOCK_TYPE,
      CHOICE_BLOCK_TYPE,
      CHOICE_OPTION_BLOCK_TYPE,
      STORY_CONTINUATION_BLOCK_TYPE,
      SCENE_JUMP_BLOCK_TYPE,
    ]);
    expect(typesIn('音乐')).toEqual([BGM_BLOCK_TYPE]);
    expect(typesIn('图片')).toEqual([
      BACKGROUND_BLOCK_TYPE,
      CHARACTER_BLOCK_TYPE,
      CLEAR_CHARACTER_BLOCK_TYPE,
      VIDEO_BLOCK_TYPE,
    ]);
  });
});
