/**
 * 文件主要作用：验证背景积木缩放字段、草稿收集与热更新兼容。
 * 测试覆盖：背景缩放事件、未失焦草稿、旧 Blockly 定义/实例升级。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import {
  collectBackgroundFieldDrafts,
  getBackgroundFieldUpdate,
} from '../../src/renderer/features/block-editor/backgroundBlockEvents';
import { AssetNameField } from '../../src/renderer/features/block-editor/blocks/assetNameField';
import {
  applyBackgroundBlockLocalization,
  BACKGROUND_BLOCK_FIELDS,
  BACKGROUND_BLOCK_TYPE,
  registerBackgroundBlock,
  setBackgroundBlockAsset,
  setBackgroundBlockScalePercent,
} from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import { getEditorLabels } from '../../src/renderer/i18n/editorLocalization';
import type { SceneDocument } from '../../src/shared/projectTypes';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: 'Scene',
  backgroundAssetId: 'initial',
  backgroundScalePercent: 90,
  nodes: [
    {
      id: 'background-1',
      type: 'background',
      assetId: 'forest',
      scalePercent: 80,
    },
  ],
};

describe('background block scale fields', () => {
  it('emits a complete update and collects an uncommitted scale draft', () => {
    registerBackgroundBlock();
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(BACKGROUND_BLOCK_TYPE, 'background-1');
    setBackgroundBlockAsset(block, 'forest', 'Forest');
    setBackgroundBlockScalePercent(block, 125);

    const workspaceSvg = workspace as unknown as Blockly.WorkspaceSvg;
    expect(
      getBackgroundFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: 'background-1',
          element: 'field',
          name: BACKGROUND_BLOCK_FIELDS.scalePercent,
        } as Blockly.Events.BlockChange,
        workspaceSvg,
        scene,
      ),
    ).toEqual({
      nodeId: 'background-1',
      assetId: 'forest',
      scalePercent: 125,
    });
    expect(collectBackgroundFieldDrafts(workspaceSvg, scene)).toEqual({
      drafts: [
        {
          nodeId: 'background-1',
          assetId: 'forest',
          scalePercent: 125,
        },
      ],
      invalidNodeId: null,
    });

    setBackgroundBlockAsset(block, 'lake', 'Lake');
    expect(
      getBackgroundFieldUpdate(
        {
          type: Blockly.Events.BLOCK_CHANGE,
          blockId: 'background-1',
          element: 'field',
          name: BACKGROUND_BLOCK_FIELDS.assetName,
        } as Blockly.Events.BlockChange,
        workspaceSvg,
        scene,
      ),
    ).toEqual({
      nodeId: 'background-1',
      assetId: 'lake',
      scalePercent: 125,
    });

    workspace.dispose();
  });

  it('upgrades stale definitions and instances without overwriting a draft', () => {
    Blockly.Blocks[BACKGROUND_BLOCK_TYPE] = {
      init(): void {
        this.appendDummyInput()
          .appendField('Background', 'VN_LABEL_BACKGROUND')
          .appendField(
            new Blockly.FieldTextInput('None'),
            BACKGROUND_BLOCK_FIELDS.assetName,
          );
      },
    };
    const staleWorkspace = new Blockly.Workspace();
    const staleBlock = staleWorkspace.newBlock(BACKGROUND_BLOCK_TYPE);
    expect(staleBlock.getField(BACKGROUND_BLOCK_FIELDS.scalePercent)).toBeNull();

    setBackgroundBlockAsset(staleBlock, 'legacy-image', 'Legacy.png');
    setBackgroundBlockScalePercent(staleBlock, 145);
    applyBackgroundBlockLocalization(
      staleBlock,
      getEditorLabels('en-US'),
    );
    expect(
      staleBlock.getFieldValue(BACKGROUND_BLOCK_FIELDS.scalePercent),
    ).toBe(145);
    expect(
      staleBlock.getField(BACKGROUND_BLOCK_FIELDS.assetName),
    ).toBeInstanceOf(AssetNameField);
    expect(
      staleBlock.getFieldValue(BACKGROUND_BLOCK_FIELDS.assetName),
    ).toBe('legacy-image');
    expect(
      staleBlock.getField(BACKGROUND_BLOCK_FIELDS.assetName)?.getText(),
    ).toBe('Legacy.png');

    registerBackgroundBlock();
    const freshWorkspace = new Blockly.Workspace();
    const freshBlock = freshWorkspace.newBlock(BACKGROUND_BLOCK_TYPE);
    expect(
      freshBlock.getFieldValue(BACKGROUND_BLOCK_FIELDS.scalePercent),
    ).toBe(100);

    staleWorkspace.dispose();
    freshWorkspace.dispose();
  });
});
