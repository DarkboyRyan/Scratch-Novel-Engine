/**
 * 文件主要作用：按类别构建本地化 Blockly 工具箱配置。
 * 包含实现：`createBlockEditorToolbox`。
 */

import type * as Blockly from 'blockly';

import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';
import { BACKGROUND_BLOCK_TYPE } from './blocks/backgroundBlock';
import {
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
} from './blocks/characterBlock';
import { SCENE_JUMP_BLOCK_TYPE } from './blocks/sceneJumpBlock';
import { BGM_BLOCK_TYPE } from './blocks/bgmBlock';
import { VIDEO_BLOCK_TYPE } from './blocks/videoBlock';
import {
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_TYPE,
} from './blocks/choiceBlock';
import { STORY_CONTINUATION_BLOCK_TYPE } from './blocks/storyContinuationBlock';
import {
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
} from './blocks/logicControlBlock';
import {
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from './blocks/variableBlock';
import { CG_DISPLAY_BLOCK_TYPE } from './blocks/cgDisplayBlock';
import { CHARACTER_EFFECT_BLOCK_TYPES } from './blocks/characterEffectBlock';
import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../i18n/editorLocalization';

export function createBlockEditorToolbox(
  includeSceneJump = true,
  labels: EditorLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE),
): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: labels.blockly.categories.story,
        colour: '35',
        contents: [
          { kind: 'block', type: DIALOGUE_BLOCK_TYPE },
          { kind: 'block', type: CHOICE_BLOCK_TYPE },
          { kind: 'block', type: CHOICE_OPTION_BLOCK_TYPE },
          { kind: 'block', type: STORY_CONTINUATION_BLOCK_TYPE },
          ...(includeSceneJump
            ? [{ kind: 'block' as const, type: SCENE_JUMP_BLOCK_TYPE }]
            : []),
        ],
      },
      {
        kind: 'category',
        name: labels.blockly.categories.logic,
        colour: '120',
        contents: [
          { kind: 'block', type: LOGIC_IF_BLOCK_TYPE },
          { kind: 'block', type: LOGIC_REPEAT_BLOCK_TYPE },
        ],
      },
      {
        kind: 'category',
        name: labels.blockly.categories.variables,
        colour: '330',
        contents: [
          { kind: 'block', type: VARIABLE_SET_BLOCK_TYPE },
          { kind: 'block', type: VARIABLE_CHANGE_BLOCK_TYPE },
        ],
      },
      {
        kind: 'category',
        name: labels.blockly.categories.music,
        colour: '210',
        contents: [{ kind: 'block', type: BGM_BLOCK_TYPE }],
      },
      {
        kind: 'category',
        name: labels.blockly.categories.image,
        colour: '285',
        contents: [
          { kind: 'block', type: BACKGROUND_BLOCK_TYPE },
          { kind: 'block', type: CHARACTER_BLOCK_TYPE },
          { kind: 'block', type: CLEAR_CHARACTER_BLOCK_TYPE },
          { kind: 'block', type: CG_DISPLAY_BLOCK_TYPE },
          { kind: 'block', type: VIDEO_BLOCK_TYPE },
        ],
      },
      {
        kind: 'category',
        name: labels.blockly.categories.effects,
        colour: '20',
        contents: Object.values(CHARACTER_EFFECT_BLOCK_TYPES).map((type) => ({
          kind: 'block' as const,
          type,
        })),
      },
    ],
  };
}
