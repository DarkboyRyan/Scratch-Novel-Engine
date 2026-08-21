import * as Blockly from 'blockly';

export const SCENE_START_BLOCK_TYPE = 'vn_scene_start';

export function getSceneStartBlockId(sceneId: string): string {
  return `vn-scene-start:${sceneId}`;
}

export function registerSceneStartBlock(): void {
  if (Blockly.Blocks[SCENE_START_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[SCENE_START_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput().appendField('开始');
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip('当前场景的固定开始位置');
      this.setHelpUrl('');
    },
  };
}
