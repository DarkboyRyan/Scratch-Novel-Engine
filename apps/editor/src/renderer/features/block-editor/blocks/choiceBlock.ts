import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../../shared/projectTypes';

export const CHOICE_BLOCK_TYPE = 'vn_choice';
export const CHOICE_OPTION_BLOCK_TYPE = 'vn_choice_option';
export const CHOICE_OPTION_CONNECTION_TYPE = 'VN_CHOICE_OPTION';

export const CHOICE_BLOCK_INPUTS = {
  options: 'OPTIONS',
} as const;

export const CHOICE_OPTION_BLOCK_FIELDS = {
  text: 'TEXT',
  targetScene: 'TARGET_SCENE',
} as const;

let currentSceneOptions: Blockly.MenuOption[] = [['当前场景', '']];

function sceneLabel(scene: SceneDocument, index: number): string {
  return scene.name === `场景 ${index + 1}`
    ? `场景 ${index + 1}`
    : `场景 ${index + 1} · ${scene.name}`;
}

export function setChoiceOptionSceneOptions(
  scenes: SceneDocument[],
): void {
  currentSceneOptions = scenes.length > 0
    ? scenes.map(
        (scene, index) => [
          sceneLabel(scene, index),
          scene.id,
        ] as Blockly.MenuOption,
      )
    : [['暂无场景', '']];
}

export function registerChoiceBlocks(): void {
  if (!Blockly.Blocks[CHOICE_BLOCK_TYPE]) {
    Blockly.Blocks[CHOICE_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput().appendField('显示选择');
        this.appendStatementInput(CHOICE_BLOCK_INPUTS.options)
          .setCheck(CHOICE_OPTION_CONNECTION_TYPE)
          .appendField('选项');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(260);
        this.setTooltip(
          '正式预览执行到这里时显示内部选项；没有选项时直接继续',
        );
        this.setHelpUrl('');
      },
    };
  }

  if (!Blockly.Blocks[CHOICE_OPTION_BLOCK_TYPE]) {
    Blockly.Blocks[CHOICE_OPTION_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField('选项')
          .appendField(
            new Blockly.FieldTextInput('选项'),
            CHOICE_OPTION_BLOCK_FIELDS.text,
          );
        this.appendDummyInput()
          .appendField('跳转到')
          .appendField(
            new Blockly.FieldDropdown(() => currentSceneOptions),
            CHOICE_OPTION_BLOCK_FIELDS.targetScene,
          );
        this.setPreviousStatement(
          true,
          CHOICE_OPTION_CONNECTION_TYPE,
        );
        this.setNextStatement(
          true,
          CHOICE_OPTION_CONNECTION_TYPE,
        );
        this.setColour(285);
        this.setTooltip('玩家选择这一项后跳转到指定场景');
        this.setHelpUrl('');
      },
    };
  }
}
