/**
 * 文件主要作用：注册对白积木并读写说话人、文本和语音资源。
 * 包含实现：`DIALOGUE_BLOCK_TYPE`、`DIALOGUE_BLOCK_FIELDS`、`applyDialogueBlockLocalization`、`setDialogueBlockVoice`、`getDialogueBlockVoiceAssetId`、`registerDialogueBlock`。
 */

import * as Blockly from 'blockly';

import {
  DEFAULT_EDITOR_LANGUAGE,
  getEditorLabels,
  type EditorLabels,
} from '../../../i18n/editorLocalization';
import {
  AssetNameField,
  ensureAssetNameField,
} from './assetNameField';

export const DIALOGUE_BLOCK_TYPE = 'vn_dialogue';

export const DIALOGUE_BLOCK_FIELDS = {
  speaker: 'SPEAKER',
  text: 'TEXT',
  voiceAssetName: 'VOICE_ASSET_NAME',
} as const;

const VOICE_ASSET_DATA_PREFIX = 'vn-dialogue-voice-asset:';
const EMPTY_VOICE_FIELD_VALUE = '\u00a0'.repeat(12);
const LABEL_FIELDS = {
  speaker: 'VN_LABEL_SPEAKER',
  text: 'VN_LABEL_TEXT',
  voice: 'VN_LABEL_VOICE',
} as const;
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

export function applyDialogueBlockLocalization(
  block: Blockly.Block,
  labels: EditorLabels,
): void {
  block.setFieldValue(labels.blockly.dialogueSpeaker, LABEL_FIELDS.speaker);
  block.setFieldValue(labels.blockly.dialogueText, LABEL_FIELDS.text);
  block.setFieldValue(labels.blockly.dialogueVoice, LABEL_FIELDS.voice);
  ensureAssetNameField(
    block,
    DIALOGUE_BLOCK_FIELDS.voiceAssetName,
    labels.inspector.noVoice,
    'audio',
    getDialogueBlockVoiceAssetId(block),
    labels.common.missingAudio,
  );
  block.setTooltip(labels.blockly.dialogueTooltip);
}

export function setDialogueBlockVoice(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data =
    assetId === null ? null : `${VOICE_ASSET_DATA_PREFIX}${assetId}`;
  const voiceField = typeof block.getField === 'function'
    ? block.getField(DIALOGUE_BLOCK_FIELDS.voiceAssetName)
    : null;
  if (voiceField instanceof AssetNameField) {
    voiceField.setAssetValue(assetId, displayName);
  } else {
    block.setFieldValue(
      displayName || EMPTY_VOICE_FIELD_VALUE,
      DIALOGUE_BLOCK_FIELDS.voiceAssetName,
    );
  }
}

export function getDialogueBlockVoiceAssetId(
  block: Blockly.Block,
): string | null {
  const voiceField = typeof block.getField === 'function'
    ? block.getField(DIALOGUE_BLOCK_FIELDS.voiceAssetName)
    : null;
  if (voiceField instanceof AssetNameField) {
    return voiceField.getAssetId();
  }
  return block.data?.startsWith(VOICE_ASSET_DATA_PREFIX)
    ? block.data.slice(VOICE_ASSET_DATA_PREFIX.length)
    : null;
}

export function registerDialogueBlock(
  labels: EditorLabels = currentLabels,
): void {
  currentLabels = labels;
  Blockly.Blocks[DIALOGUE_BLOCK_TYPE] = {
    init(): void {
      const voiceField = new AssetNameField(
        currentLabels.inspector.noVoice,
        'audio',
      );

      this.appendDummyInput()
        .appendField(currentLabels.blockly.dialogueSpeaker, LABEL_FIELDS.speaker)
        .appendField(
          new Blockly.FieldTextInput(''),
          DIALOGUE_BLOCK_FIELDS.speaker,
        );
      this.appendDummyInput()
        .appendField(currentLabels.blockly.dialogueText, LABEL_FIELDS.text)
        .appendField(
          new Blockly.FieldTextInput(''),
          DIALOGUE_BLOCK_FIELDS.text,
        );
      this.appendDummyInput()
        .appendField(currentLabels.blockly.dialogueVoice, LABEL_FIELDS.voice)
        .appendField(voiceField, DIALOGUE_BLOCK_FIELDS.voiceAssetName);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(35);
      this.setTooltip(currentLabels.blockly.dialogueTooltip);
      this.setHelpUrl('');
    },
  };
}
