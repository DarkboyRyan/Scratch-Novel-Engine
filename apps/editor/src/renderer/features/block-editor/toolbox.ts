import type * as Blockly from 'blockly';

export const starterToolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'flyoutToolbox',
  contents: [
    {
      kind: 'block',
      type: 'text',
      fields: {
        TEXT: '第一句测试对白',
      },
    },
    {
      kind: 'block',
      type: 'text_print',
    },
  ],
};