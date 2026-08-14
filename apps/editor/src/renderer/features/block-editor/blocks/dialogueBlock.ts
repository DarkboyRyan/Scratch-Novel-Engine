import * as Blockly from 'blockly';

export const DIALOGUE_BLOCK_TYPE = 'vn_dialogue';

export const DIALOGUE_BLOCK_FIELDS = {
  speaker: 'SPEAKER',
  text: 'TEXT',
  voiceAssetName: 'VOICE_ASSET_NAME',
} as const;

const VOICE_ASSET_DATA_PREFIX = 'vn-dialogue-voice-asset:';
const EMPTY_VOICE_FIELD_VALUE = '\u00a0'.repeat(12);

export function setDialogueBlockVoice(
  block: Blockly.Block,
  assetId: string | null,
  displayName = '',
): void {
  block.data =
    assetId === null ? null : `${VOICE_ASSET_DATA_PREFIX}${assetId}`;
  block.setFieldValue(
    displayName || EMPTY_VOICE_FIELD_VALUE,
    DIALOGUE_BLOCK_FIELDS.voiceAssetName,
  );
}

export function getDialogueBlockVoiceAssetId(
  block: Blockly.Block,
): string | null {
  return block.data?.startsWith(VOICE_ASSET_DATA_PREFIX)
    ? block.data.slice(VOICE_ASSET_DATA_PREFIX.length)
    : null;
}

export function registerDialogueBlock(): void {
  // Blockly 的积木定义是全局注册的。
  // React StrictMode 可能重复挂载，所以先检查是否已经注册。
  if (Blockly.Blocks[DIALOGUE_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[DIALOGUE_BLOCK_TYPE] = {
    init(): void {
      const voiceField = new Blockly.FieldTextInput(
        EMPTY_VOICE_FIELD_VALUE,
        undefined,
        { spellcheck: false },
      );

      this.appendDummyInput()
        .appendField('角色')
        .appendField(
          new Blockly.FieldTextInput('旁白'),
          DIALOGUE_BLOCK_FIELDS.speaker,
        );
      this.appendDummyInput()
        .appendField('对白')
        .appendField(
          new Blockly.FieldTextInput(''),
          DIALOGUE_BLOCK_FIELDS.text,
        );
      this.appendDummyInput()
        .appendField('语音')
        .appendField(voiceField, DIALOGUE_BLOCK_FIELDS.voiceAssetName);
      // 语音名必须对应真实 Asset ID，只允许从资源条拖入。
      voiceField.setEnabled(false);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(35);
      this.setTooltip('显示一句角色对白，可选播放一次人物语音');
      this.setHelpUrl('');
    },
  };
}
