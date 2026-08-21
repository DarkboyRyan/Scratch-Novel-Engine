import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import { getCharacterFieldUpdate } from '../../src/renderer/features/block-editor/characterBlockEvents';
import {
  CHARACTER_BLOCK_FIELDS,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  registerCharacterBlock,
  setCharacterBlockAsset,
  setCharacterBlockPosition,
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
      position: null,
    },
  ],
};

describe('getCharacterFieldUpdate', () => {
  it('registers a clear-portrait block with a selectable layer', () => {
    registerCharacterBlock();
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(CLEAR_CHARACTER_BLOCK_TYPE);

    expect(block.previousConnection).not.toBeNull();
    expect(block.nextConnection).not.toBeNull();
    expect(
      block.getField(CHARACTER_BLOCK_FIELDS.layer),
    ).toBeInstanceOf(Blockly.FieldDropdown);
    expect(block.getFieldValue(CHARACTER_BLOCK_FIELDS.layer)).toBe('1');

    workspace.dispose();
  });

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
      position: null,
    });
  });

  it('shows a custom position without exposing its coordinates in Blockly', () => {
    registerCharacterBlock();
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(CHARACTER_BLOCK_TYPE);
    setCharacterBlockAsset(block, 'asset-1', 'Alice');
    setCharacterBlockPosition(block, 'left', { x: 28, y: 86 });

    const positionField = block.getField(
      CHARACTER_BLOCK_FIELDS.slot,
    ) as Blockly.FieldDropdown;
    expect(block.getFieldValue(CHARACTER_BLOCK_FIELDS.slot)).toBe('custom');
    expect(positionField.getOptions(false)).toContainEqual(['自定义', 'custom']);
    expect(block.toString()).not.toContain('28');
    expect(block.toString()).not.toContain('86');

    const customScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'character-1',
          type: 'character',
          assetId: 'asset-1',
          slot: 'left',
          layer: 2,
          position: { x: 28, y: 86 },
        },
      ],
    };
    expect(
      getCharacterFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: 'character-1',
          element: 'field',
          name: CHARACTER_BLOCK_FIELDS.slot,
        } as Blockly.Events.BlockChange,
        {
          getBlockById: () => block,
        } as unknown as Blockly.WorkspaceSvg,
        customScene,
      ),
    ).toMatchObject({
      slot: 'left',
      position: { x: 28, y: 86 },
    });

    workspace.dispose();
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

  it('updates the layer of a clear-portrait node without inventing an asset', () => {
    const clearScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'clear-1',
          type: 'character',
          assetId: null,
          slot: 'center',
          layer: 2,
          position: null,
        },
      ],
    };
    const fields = new Map<string, string>([['LAYER', '6']]);
    const block = {
      id: 'clear-1',
      type: CLEAR_CHARACTER_BLOCK_TYPE,
      data: null,
      getFieldValue: (name: string) => fields.get(name),
    } as unknown as Blockly.BlockSvg;
    const workspace = {
      getBlockById: () => block,
    } as unknown as Blockly.WorkspaceSvg;

    expect(
      getCharacterFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: 'clear-1',
          element: 'field',
          name: CHARACTER_BLOCK_FIELDS.layer,
        } as Blockly.Events.BlockChange,
        workspace,
        clearScene,
      ),
    ).toEqual({
      nodeId: 'clear-1',
      assetId: null,
      slot: 'center',
      layer: 6,
      position: null,
    });
  });
});
