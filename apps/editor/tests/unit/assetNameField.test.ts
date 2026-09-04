/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Blockly 资源字段的类型过滤、稳定 ID 与名称前缀搜索。
 * 测试覆盖：`AssetNameField`、`filterAssetOptionsByPrefix`。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import {
  AssetNameField,
  ensureAssetNameField,
  filterAssetOptionsByPrefix,
  setAssetNameFieldCatalog,
} from '../../src/renderer/features/block-editor/blocks/assetNameField';
import {
  applyBackgroundBlockLocalization,
  BACKGROUND_BLOCK_FIELDS,
  BACKGROUND_BLOCK_TYPE,
  getBackgroundBlockAssetId,
  registerBackgroundBlock,
  setBackgroundBlockAsset,
} from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import {
  applyBgmBlockLocalization,
  BGM_BLOCK_FIELDS,
  BGM_BLOCK_TYPE,
  getBgmBlockAssetId,
  registerBgmBlock,
  setBgmBlockAsset,
} from '../../src/renderer/features/block-editor/blocks/bgmBlock';
import {
  applyCharacterBlockLocalization,
  CHARACTER_BLOCK_FIELDS,
  CHARACTER_BLOCK_TYPE,
  getCharacterBlockAssetId,
  registerCharacterBlock,
  setCharacterBlockAsset,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import {
  applyDialogueBlockLocalization,
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
  getDialogueBlockVoiceAssetId,
  registerDialogueBlock,
  setDialogueBlockVoice,
} from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import {
  applyVideoBlockLocalization,
  getVideoBlockAssetId,
  registerVideoBlock,
  setVideoBlockAsset,
  VIDEO_BLOCK_FIELDS,
  VIDEO_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/videoBlock';
import { getEditorLabels } from '../../src/renderer/i18n/editorLocalization';
import type { AssetDocument } from '../../src/shared/projectTypes';

const assets: AssetDocument[] = [
  {
    id: 'image-forest',
    type: 'image',
    displayName: 'Forest Day.png',
  },
  {
    id: 'image-forest-night',
    type: 'image',
    displayName: 'forest night.png',
  },
  {
    id: 'audio-forest',
    type: 'audio',
    displayName: 'Forest Theme.ogg',
  },
];

describe('AssetNameField', () => {
  it('keeps the Asset ID as its value and only lists the requested type', () => {
    setAssetNameFieldCatalog(assets, getEditorLabels('en-US'));
    const field = new AssetNameField('No background', 'image');
    field.setAssetValue('image-forest', 'Forest Day.png');

    expect(field.getValue()).toBe('image-forest');
    expect(field.getText()).toBe('Forest Day.png');
    expect(
      field.getOptions(false).map((option) => String(option[1])),
    ).toEqual(['', 'image-forest', 'image-forest-night']);
  });

  it('matches imported names by normalized case-insensitive prefix, not by private ID', () => {
    expect(
      filterAssetOptionsByPrefix(
        [
          { label: 'Forest Day.png', value: 'image-a7e3' },
          { label: 'forest night.png', value: 'image-b8f4' },
          { label: 'Ｆｏｒｅｓｔ Path.png', value: 'image-c9f5' },
          { label: 'City.png', value: 'image-forest-private' },
        ],
        'FoReSt',
      ).map((option) => option.value),
    ).toEqual(['image-a7e3', 'image-b8f4', 'image-c9f5']);
  });

  it('preserves a missing authoritative resource as an explicit option', () => {
    setAssetNameFieldCatalog([], getEditorLabels('zh-CN'));
    const field = new AssetNameField('无立绘', 'image');
    field.setAssetValue('missing-image', '缺失图片');

    expect(field.getAssetId()).toBe('missing-image');
    expect(field.getText()).toBe('缺失图片');
    expect(field.getOptions(false)).toEqual([
      ['无立绘', ''],
      ['缺失图片', 'missing-image'],
    ]);
  });

  it('upgrades a legacy one-argument field in place to a typed catalog', () => {
    const blockType = 'vn_test_legacy_asset_name_field';
    setAssetNameFieldCatalog(assets, getEditorLabels('en-US'));
    Blockly.Blocks[blockType] = {
      init(): void {
        this.appendDummyInput().appendField(
          new AssetNameField('None'),
          'ASSET',
        );
      },
    };
    const workspace = new Blockly.Workspace();

    try {
      const block = workspace.newBlock(blockType);
      const legacyField = block.getField('ASSET');
      const upgradedField = ensureAssetNameField(
        block,
        'ASSET',
        'No background',
        'image',
        null,
      );

      expect(upgradedField).toBe(legacyField);
      expect(
        upgradedField?.getOptions(false).map((option) => option[1]),
      ).toEqual(['', 'image-forest', 'image-forest-night']);
    } finally {
      workspace.dispose();
      delete Blockly.Blocks[blockType];
    }
  });

  it('relocalizes missing resource labels without changing their IDs', () => {
    const zhLabels = getEditorLabels('zh-CN');
    const enLabels = getEditorLabels('en-US');
    setAssetNameFieldCatalog([], zhLabels);
    registerBackgroundBlock(zhLabels);
    registerCharacterBlock(zhLabels);
    registerDialogueBlock(zhLabels);
    registerBgmBlock(zhLabels);
    registerVideoBlock(zhLabels);
    const workspace = new Blockly.Workspace();

    try {
      const background = workspace.newBlock(BACKGROUND_BLOCK_TYPE);
      const character = workspace.newBlock(CHARACTER_BLOCK_TYPE);
      const dialogue = workspace.newBlock(DIALOGUE_BLOCK_TYPE);
      const bgm = workspace.newBlock(BGM_BLOCK_TYPE);
      const video = workspace.newBlock(VIDEO_BLOCK_TYPE);
      setBackgroundBlockAsset(
        background,
        'missing-background',
        zhLabels.common.missingImage,
      );
      setCharacterBlockAsset(
        character,
        'missing-character',
        zhLabels.common.missingImage,
      );
      setDialogueBlockVoice(
        dialogue,
        'missing-voice',
        zhLabels.common.missingAudio,
      );
      setBgmBlockAsset(
        bgm,
        'missing-bgm',
        zhLabels.common.missingAudio,
      );
      setVideoBlockAsset(
        video,
        'missing-video',
        zhLabels.common.missingVideo,
      );

      setAssetNameFieldCatalog([], enLabels);
      Blockly.Events.disable();
      try {
        applyBackgroundBlockLocalization(background, enLabels);
        applyCharacterBlockLocalization(character, enLabels);
        applyDialogueBlockLocalization(dialogue, enLabels);
        applyBgmBlockLocalization(bgm, enLabels);
        applyVideoBlockLocalization(video, enLabels);
      } finally {
        Blockly.Events.enable();
      }

      expect(getBackgroundBlockAssetId(background)).toBe(
        'missing-background',
      );
      expect(getCharacterBlockAssetId(character)).toBe('missing-character');
      expect(getDialogueBlockVoiceAssetId(dialogue)).toBe('missing-voice');
      expect(getBgmBlockAssetId(bgm)).toBe('missing-bgm');
      expect(getVideoBlockAssetId(video)).toBe('missing-video');
      expect(
        background.getField(BACKGROUND_BLOCK_FIELDS.assetName)?.getText(),
      ).toBe(enLabels.common.missingImage);
      expect(
        character.getField(CHARACTER_BLOCK_FIELDS.assetName)?.getText(),
      ).toBe(enLabels.common.missingImage);
      expect(
        dialogue.getField(DIALOGUE_BLOCK_FIELDS.voiceAssetName)?.getText(),
      ).toBe(enLabels.common.missingAudio);
      expect(bgm.getField(BGM_BLOCK_FIELDS.assetName)?.getText()).toBe(
        enLabels.common.missingAudio,
      );
      expect(video.getField(VIDEO_BLOCK_FIELDS.assetName)?.getText()).toBe(
        enLabels.common.missingVideo,
      );
    } finally {
      workspace.dispose();
    }
  });
});
