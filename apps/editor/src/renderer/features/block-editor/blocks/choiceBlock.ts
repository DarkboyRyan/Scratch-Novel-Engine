/**
 * 文件主要作用：注册选项容器和分支积木并维护分支文本与目标场景。
 * 包含实现：`CHOICE_BLOCK_TYPE`、`CHOICE_OPTION_BLOCK_TYPE`、`CHOICE_OPTION_CONNECTION_TYPE`、`CHOICE_BLOCK_INPUTS`、`CHOICE_OPTION_BLOCK_FIELDS`、`applyChoiceBlockLocalization` 等 8 项。
 */

import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../../shared/projectTypes';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';

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

const LABEL_FIELDS = {
  choice: 'VN_LABEL_CHOICE',
  choices: 'VN_LABEL_CHOICES',
  option: 'VN_LABEL_OPTION',
  jump: 'VN_LABEL_OPTION_JUMP',
} as const;
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);
let currentSceneOptions: Blockly.MenuOption[] = [[currentLabels.blockly.currentScene, '']];

function sceneLabel(scene: SceneDocument, index: number, labels: EditorLabels): string {
  return scene.name === `场景 ${index + 1}`
    ? `${labels.common.scene} ${index + 1}`
    : `${labels.common.scene} ${index + 1} · ${scene.name}`;
}

export function applyChoiceBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  if (block.type === CHOICE_BLOCK_TYPE) {
    block.setFieldValue(labels.blockly.showChoice, LABEL_FIELDS.choice);
    block.setFieldValue(labels.blockly.choices, LABEL_FIELDS.choices);
    block.setTooltip(labels.blockly.choiceTooltip);
    return;
  }
  block.setFieldValue(labels.blockly.choice, LABEL_FIELDS.option);
  block.setFieldValue(labels.blockly.choiceJumpTo, LABEL_FIELDS.jump);
  const field = block.getField(CHOICE_OPTION_BLOCK_FIELDS.targetScene);
  if (field instanceof Blockly.FieldDropdown) {
    const value = String(field.getValue());
    field.setOptions(() => currentSceneOptions);
    if (currentSceneOptions.some((option) => option[1] === value)) {
      field.setValue(value);
    }
  }
  block.setTooltip(labels.blockly.choiceOptionTooltip);
}

export function setChoiceOptionSceneOptions(
  scenes: SceneDocument[],
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  currentSceneOptions = scenes.length > 0
    ? scenes.map(
        (scene, index) => [
          sceneLabel(scene, index, labels),
          scene.id,
        ] as Blockly.MenuOption,
      )
    : [[labels.blockly.noScenes, '']];
}

export function registerChoiceBlocks(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  if (!Blockly.Blocks[CHOICE_BLOCK_TYPE]) {
    Blockly.Blocks[CHOICE_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput().appendField(currentLabels.blockly.showChoice, LABEL_FIELDS.choice);
        this.appendStatementInput(CHOICE_BLOCK_INPUTS.options)
          .setCheck(CHOICE_OPTION_CONNECTION_TYPE)
          .appendField(currentLabels.blockly.choices, LABEL_FIELDS.choices);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(260);
        this.setTooltip(
          currentLabels.blockly.choiceTooltip,
        );
        this.setHelpUrl('');
      },
    };
  }

  if (!Blockly.Blocks[CHOICE_OPTION_BLOCK_TYPE]) {
    Blockly.Blocks[CHOICE_OPTION_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField(currentLabels.blockly.choice, LABEL_FIELDS.option)
          .appendField(
            new Blockly.FieldTextInput(currentLabels.blockly.choiceDefault),
            CHOICE_OPTION_BLOCK_FIELDS.text,
          );
        this.appendDummyInput()
          .appendField(currentLabels.blockly.choiceJumpTo, LABEL_FIELDS.jump)
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
        this.setTooltip(currentLabels.blockly.choiceOptionTooltip);
        this.setHelpUrl('');
      },
    };
  }
}
