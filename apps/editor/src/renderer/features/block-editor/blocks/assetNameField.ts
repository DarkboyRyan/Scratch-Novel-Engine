/**
 * 文件主要作用：提供截断显示且点击可查看完整资源名的 Blockly 字段。
 * 包含实现：`ASSET_NAME_MAX_DISPLAY_LENGTH`、`limitAssetFieldDisplay`、`AssetNameField`。
 */

import * as Blockly from 'blockly';

// Keep asset-backed blocks compact while retaining the complete display name
// as the field value. Blockly applies the ellipsis only to rendered text.
export const ASSET_NAME_MAX_DISPLAY_LENGTH = 18;

export function limitAssetFieldDisplay(field: Blockly.Field): void {
  field.maxDisplayLength = ASSET_NAME_MAX_DISPLAY_LENGTH;
}

/**
 * A display-only text field that opens the complete asset name on click.
 * Asset IDs remain the source of truth in block.data; this field must never
 * become a second editable source of asset state.
 */
export class AssetNameField extends Blockly.FieldTextInput {
  constructor(value: string) {
    super(value, undefined, { spellcheck: false });
    limitAssetFieldDisplay(this);
    this.setTooltip(() => this.getText());
  }

  protected override showEditor_(): void {
    const fullName = this.getText().replaceAll(Blockly.Field.NBSP, ' ').trim();
    if (!fullName) {
      return;
    }

    Blockly.DropDownDiv.hideWithoutAnimation();
    Blockly.DropDownDiv.clearContent();
    const content = document.createElement('div');
    content.className = 'vn-blockly-asset-name-popup';
    content.textContent = fullName;
    content.title = fullName;
    Blockly.DropDownDiv.getContentDiv().append(content);
    Blockly.DropDownDiv.setColour('#ffffff', '#cbd5e1');
    Blockly.DropDownDiv.showPositionedByField(this);
  }
}
