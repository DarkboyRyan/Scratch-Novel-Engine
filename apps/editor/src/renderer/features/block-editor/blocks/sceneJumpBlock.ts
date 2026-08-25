import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../../shared/projectTypes';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';

export const SCENE_JUMP_BLOCK_TYPE = 'vn_scene_jump';
export const SCENE_JUMP_BLOCK_FIELDS = {
  targetScene: 'TARGET_SCENE',
} as const;

const LABEL_FIELD = 'VN_LABEL_SCENE_JUMP';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);
let currentSceneOptions: Blockly.MenuOption[] = [[currentLabels.blockly.noOtherScenes, '']];

export function applySceneJumpBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  block.setFieldValue(labels.blockly.jumpTo, LABEL_FIELD);
  const field = block.getField(SCENE_JUMP_BLOCK_FIELDS.targetScene);
  if (field instanceof Blockly.FieldDropdown) {
    const value = String(field.getValue());
    field.setOptions(() => currentSceneOptions);
    if (currentSceneOptions.some((option) => option[1] === value)) {
      field.setValue(value);
    }
  }
  block.setTooltip(labels.blockly.jumpTooltip);
}

export function setSceneJumpBlockOptions(
  scenes: SceneDocument[],
  currentSceneId: string,
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  const options = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => scene.id !== currentSceneId)
    .map(({ scene, index }) => [
      scene.name === `场景 ${index + 1}`
        ? `${labels.common.scene} ${index + 1}`
        : `${labels.common.scene} ${index + 1} · ${scene.name}`,
      scene.id,
    ] as Blockly.MenuOption);
  currentSceneOptions = options.length > 0
    ? options
    : [[labels.blockly.noOtherScenes, '']];
}

export function registerSceneJumpBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  if (Blockly.Blocks[SCENE_JUMP_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[SCENE_JUMP_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput()
        .appendField(currentLabels.blockly.jumpTo, LABEL_FIELD)
        .appendField(
          new Blockly.FieldDropdown(() => currentSceneOptions),
          SCENE_JUMP_BLOCK_FIELDS.targetScene,
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(205);
      this.setTooltip(currentLabels.blockly.jumpTooltip);
      this.setHelpUrl('');
    },
  };
}
