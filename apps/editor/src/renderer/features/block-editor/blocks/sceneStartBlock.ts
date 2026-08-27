/**
 * 文件主要作用：注册不可删除的场景起点积木。
 * 包含实现：`SCENE_START_BLOCK_TYPE`、`applySceneStartBlockLocalization`、`getSceneStartBlockId`、`registerSceneStartBlock`。
 */

import * as Blockly from 'blockly';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';

export const SCENE_START_BLOCK_TYPE = 'vn_scene_start';
const LABEL_FIELD = 'VN_LABEL_SCENE_START';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

export function applySceneStartBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  block.setFieldValue(labels.blockly.sceneStart, LABEL_FIELD);
  block.setTooltip(labels.blockly.sceneStartTooltip);
}

export function getSceneStartBlockId(sceneId: string): string {
  return `vn-scene-start:${sceneId}`;
}

export function registerSceneStartBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  if (Blockly.Blocks[SCENE_START_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[SCENE_START_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput().appendField(currentLabels.blockly.sceneStart, LABEL_FIELD);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip(currentLabels.blockly.sceneStartTooltip);
      this.setHelpUrl('');
    },
  };
}
