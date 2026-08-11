import * as Blockly from 'blockly';

export const DIALOGUE_BLOCK_TYPE = 'vn_dialogue';

export const DIALOGUE_BLOCK_FIELDS = {
  speaker: 'SPEAKER',
  text: 'TEXT',
} as const;

export function registerDialogueBlock(): void {
  // Blockly 的积木定义是全局注册的。
  // React StrictMode 可能重复挂载，所以先检查是否已经注册。
  if (Blockly.Blocks[DIALOGUE_BLOCK_TYPE]) {
    return;
  }

  Blockly.common.defineBlocksWithJsonArray([
    {
      type: DIALOGUE_BLOCK_TYPE,
      message0: '角色 %1',
      args0: [
        {
          type: 'field_input',
          name: DIALOGUE_BLOCK_FIELDS.speaker,
          text: '旁白',
        },
      ],
      message1: '对白 %1',
      args1: [
        {
          type: 'field_input',
          name: DIALOGUE_BLOCK_FIELDS.text,
          text: '',
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 35,
      tooltip: '显示一句角色对白',
      helpUrl: '',
    },
  ]);
}
