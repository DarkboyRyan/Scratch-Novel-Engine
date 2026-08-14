import { describe, expect, it } from 'vitest';

import { BGM_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/bgmBlock';
import { VIDEO_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/videoBlock';
import {
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/choiceBlock';
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
    expect(isStoryBlockType(BGM_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType(VIDEO_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType(CHOICE_BLOCK_TYPE)).toBe(true);
    expect(isStoryBlockType(CHOICE_OPTION_BLOCK_TYPE)).toBe(false);
    expect(isStoryBlockType('unrelated-block')).toBe(false);
  });

  it('offers video creation through the Blockly toolbox', () => {
    const toolbox = JSON.stringify(createBlockEditorToolbox());
    expect(toolbox).toContain(VIDEO_BLOCK_TYPE);
    expect(toolbox).toContain(CHOICE_BLOCK_TYPE);
    expect(toolbox).toContain(CHOICE_OPTION_BLOCK_TYPE);
  });
});
