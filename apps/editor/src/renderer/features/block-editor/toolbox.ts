import type * as Blockly from 'blockly';

import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';

export const blockEditorToolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '剧情',
      colour: '35',
      contents: [
        {
          kind: 'block',
          type: DIALOGUE_BLOCK_TYPE,
        },
      ],
    },
  ],
};
