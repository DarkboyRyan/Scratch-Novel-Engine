import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import {
  getSceneStartBlockId,
  registerSceneStartBlock,
  SCENE_START_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/sceneStartBlock';

describe('scene start block', () => {
  it('is a fixed scene-local header with only a downward connection', () => {
    registerSceneStartBlock();
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(
      SCENE_START_BLOCK_TYPE,
      getSceneStartBlockId('scene-1'),
    );

    expect(block.id).toBe('vn-scene-start:scene-1');
    expect(block.previousConnection).toBeNull();
    expect(block.nextConnection).not.toBeNull();
    expect(block.toString()).toContain('开始');

    workspace.dispose();
  });
});
