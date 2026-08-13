import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../../shared/projectTypes';

export const SCENE_JUMP_BLOCK_TYPE = 'vn_scene_jump';
export const SCENE_JUMP_BLOCK_FIELDS = {
  targetScene: 'TARGET_SCENE',
} as const;

let currentSceneOptions: Blockly.MenuOption[] = [['暂无其他场景', '']];

export function setSceneJumpBlockOptions(
  scenes: SceneDocument[],
  currentSceneId: string,
): void {
  const options = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => scene.id !== currentSceneId)
    .map(({ scene, index }) => [
      scene.name === `场景 ${index + 1}`
        ? `场景 ${index + 1}`
        : `场景 ${index + 1} · ${scene.name}`,
      scene.id,
    ] as Blockly.MenuOption);
  currentSceneOptions = options.length > 0
    ? options
    : [['暂无其他场景', '']];
}

export function registerSceneJumpBlock(): void {
  if (Blockly.Blocks[SCENE_JUMP_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[SCENE_JUMP_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput()
        .appendField('跳转到')
        .appendField(
          new Blockly.FieldDropdown(() => currentSceneOptions),
          SCENE_JUMP_BLOCK_FIELDS.targetScene,
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(205);
      this.setTooltip('正式预览执行到这里时进入选中的场景');
      this.setHelpUrl('');
    },
  };
}
