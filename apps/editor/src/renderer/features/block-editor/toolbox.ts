import type * as Blockly from 'blockly';

import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';
import { BACKGROUND_BLOCK_TYPE } from './blocks/backgroundBlock';
import { CHARACTER_BLOCK_TYPE } from './blocks/characterBlock';
import { SCENE_JUMP_BLOCK_TYPE } from './blocks/sceneJumpBlock';

export function createBlockEditorToolbox(
  includeSceneJump = true,
): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: '剧情',
        colour: '35',
        contents: [
          { kind: 'block', type: DIALOGUE_BLOCK_TYPE },
          { kind: 'block', type: BACKGROUND_BLOCK_TYPE },
          { kind: 'block', type: CHARACTER_BLOCK_TYPE },
          ...(includeSceneJump
            ? [{ kind: 'block' as const, type: SCENE_JUMP_BLOCK_TYPE }]
            : []),
        ],
      },
    ],
  };
}
