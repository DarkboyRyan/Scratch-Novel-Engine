/**
 * 文件主要作用：验证 getCharacterFieldUpdate 的行为。
 * 测试覆盖：`getCharacterFieldUpdate`。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import {
  getCharacterFieldUpdate,
  resolveNewCharacterPlacement,
} from '../../src/renderer/features/block-editor/characterBlockEvents';
import {
  ASSET_NAME_MAX_DISPLAY_LENGTH,
  AssetNameField,
} from '../../src/renderer/features/block-editor/blocks/assetNameField';
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
      mode: 'show',
      assetId: 'asset-1',
      slot: 'left',
      layer: 2,
      position: null,
      effect: null,
    },
  ],
};

describe('getCharacterFieldUpdate', () => {
  it('keeps portrait and clear-layer toolbox drops distinct', () => {
    expect(resolveNewCharacterPlacement(CHARACTER_BLOCK_TYPE)).toEqual({
      mode: 'show',
      assetId: null,
    });
    expect(resolveNewCharacterPlacement(CLEAR_CHARACTER_BLOCK_TYPE)).toEqual({
      mode: 'clear',
      assetId: null,
    });
    expect(resolveNewCharacterPlacement('vn_dialogue')).toBeUndefined();
  });

  it('shortens only the rendered portrait name and retains the full value', () => {
    registerCharacterBlock();
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(CHARACTER_BLOCK_TYPE);
    const fullName = 'avery-very-long-character-portrait-filename.png';
    const field = block.getField(CHARACTER_BLOCK_FIELDS.assetName);

    expect(field).toBeInstanceOf(AssetNameField);
    expect(field?.getText()).toBe('无');
    setCharacterBlockAsset(block, 'asset-1', fullName);
    expect(field?.maxDisplayLength).toBe(ASSET_NAME_MAX_DISPLAY_LENGTH);
    expect(field?.getText()).toBe(fullName);
    expect(
      (
        field as Blockly.Field & {
          getDisplayText_(): string;
        }
      ).getDisplayText_(),
    ).toContain('…');

    workspace.dispose();
  });

  it('registers a clear-portrait block with a selectable layer', () => {
    registerCharacterBlock();
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(CLEAR_CHARACTER_BLOCK_TYPE);

    expect(block.previousConnection).not.toBeNull();
    expect(block.nextConnection).not.toBeNull();
    expect(block.getField(CHARACTER_BLOCK_FIELDS.layer)).toBeInstanceOf(
      Blockly.FieldDropdown,
    );
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
      mode: 'show',
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
    expect(positionField.getOptions(false)).toContainEqual([
      '自定义',
      'custom',
    ]);
    expect(block.toString()).not.toContain('28');
    expect(block.toString()).not.toContain('86');

    const customScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'character-1',
          type: 'character',
          mode: 'show',
          assetId: 'asset-1',
          slot: 'left',
          layer: 2,
          position: { x: 28, y: 86 },
          effect: null,
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
          mode: 'clear',
          assetId: null,
          slot: 'center',
          layer: 2,
          position: null,
          effect: null,
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
      mode: 'clear',
      assetId: null,
      slot: 'center',
      layer: 6,
      position: null,
    });
  });
});
