import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import { getCharacterFieldUpdate } from '../../src/renderer/features/block-editor/characterBlockEvents';
import {
  CHARACTER_BLOCK_TYPE,
  setCharacterBlockAsset,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import type { SceneDocument } from '../../src/shared/projectTypes';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: 'Scene',
  backgroundAssetId: null,
  nodes: [
    {
      id: 'character-1',
      type: 'character',
      assetId: 'asset-1',
      slot: 'left',
      layer: 2,
    },
  ],
};

describe('getCharacterFieldUpdate', () => {
  it('reads the complete authoritative character edit from its block', () => {
    const fields = new Map<string, string>([
      ['SLOT', 'right'],
      ['LAYER', '4'],
    ]);
    const block = {
      id: 'character-1',
      type: CHARACTER_BLOCK_TYPE,
      data: null,
      setFieldValue: (value: string, name: string) => fields.set(name, value),
      getFieldValue: (name: string) => fields.get(name),
    } as unknown as Blockly.BlockSvg;
    setCharacterBlockAsset(block, 'asset-1', 'Alice');
    const workspace = {
      getBlockById: () => block,
    } as unknown as Blockly.WorkspaceSvg;

    expect(
      getCharacterFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: 'character-1',
          element: 'field',
          name: 'LAYER',
        } as Blockly.Events.BlockChange,
        workspace,
        scene,
      ),
    ).toEqual({
      nodeId: 'character-1',
      assetId: 'asset-1',
      slot: 'right',
      layer: 4,
    });
  });

  it('ignores non-character fields and temporary blocks', () => {
    const workspace = {
      getBlockById: () => null,
    } as unknown as Blockly.WorkspaceSvg;
    expect(
      getCharacterFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: 'temporary',
          element: 'field',
          name: 'SPEAKER',
        } as Blockly.Events.BlockChange,
        workspace,
        scene,
      ),
    ).toBeNull();
  });
});
