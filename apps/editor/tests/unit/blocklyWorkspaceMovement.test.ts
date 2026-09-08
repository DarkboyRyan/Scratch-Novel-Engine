/**
 * 文件主要作用：验证各 Blockly 编辑界面共享的工作区移动配置。
 * 测试覆盖：滚动条、左键空白拖动和平移时的滚轮策略。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import { BLOCKLY_WORKSPACE_MOVE_OPTIONS } from '../../src/renderer/features/block-editor/blocklyWorkspaceMovement';

describe('Blockly workspace movement', () => {
  it('enables native canvas dragging while retaining scrollbars and wheel zoom', () => {
    const options = new Blockly.Options({
      move: BLOCKLY_WORKSPACE_MOVE_OPTIONS,
      zoom: { wheel: true },
    });

    expect(options.moveOptions).toMatchObject({
      scrollbars: true,
      drag: true,
      wheel: false,
    });
    expect(options.zoomOptions.wheel).toBe(true);
  });
});
