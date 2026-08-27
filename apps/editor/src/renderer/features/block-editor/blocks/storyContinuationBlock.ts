/**
 * 文件主要作用：注册故事续页积木并维护页码序号。
 * 包含实现：`STORY_CONTINUATION_BLOCK_TYPE`、`STORY_CONTINUATION_BLOCK_FIELDS`、`applyStoryContinuationBlockLocalization`、`getStoryContinuationBlockSequence`、`setStoryContinuationBlockSequence`、`registerStoryContinuationBlock`。
 */

import * as Blockly from 'blockly';
import { DEFAULT_EDITOR_LANGUAGE, getEditorLabels, type EditorLabels } from '../../../i18n/editorLocalization';

export const STORY_CONTINUATION_BLOCK_TYPE =
  'vn_story_continuation';

export const STORY_CONTINUATION_BLOCK_FIELDS = {
  sequence: 'SEQUENCE',
} as const;
const LABEL_FIELD = 'VN_LABEL_CONTINUATION';
let currentLabels = getEditorLabels(DEFAULT_EDITOR_LANGUAGE);

export function applyStoryContinuationBlockLocalization(block: Blockly.Block, labels: EditorLabels): void {
  block.setFieldValue(labels.blockly.continuation, LABEL_FIELD);
  block.setTooltip(labels.blockly.continuationTooltip);
}

export function getStoryContinuationBlockSequence(
  block: Blockly.Block,
): number {
  return Number(
    block.getFieldValue(STORY_CONTINUATION_BLOCK_FIELDS.sequence),
  );
}

export function setStoryContinuationBlockSequence(
  block: Blockly.Block,
  sequence: number,
  extensionCount: number,
): void {
  const field = block.getField(
    STORY_CONTINUATION_BLOCK_FIELDS.sequence,
  );
  if (field instanceof Blockly.FieldNumber) {
    field.setConstraints(1, Math.max(1, extensionCount), 1);
  }
  block.setFieldValue(
    String(sequence),
    STORY_CONTINUATION_BLOCK_FIELDS.sequence,
  );
}

class StoryContinuationSequenceField extends Blockly.FieldNumber {
  protected override doClassValidation_(newValue?: unknown): number | null {
    if (
      (typeof newValue === 'string' && newValue.trim() === '') ||
      (typeof newValue !== 'string' && typeof newValue !== 'number')
    ) {
      return null;
    }

    const sequence = Number(newValue);
    // Blockly 默认会把空字符串转成 0，并把 0/越界/小数
    // 静默 clamp 或 round 到合法值。页序是移动整页的命令，
    // 这种隐式修正可能搬错剧情，所以无效输入必须保留原值。
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < this.getMin() ||
      sequence > this.getMax()
    ) {
      return null;
    }

    return sequence;
  }

  override initView(): void {
    super.initView();
    this.getSvgRoot()?.classList.add(
      'vn-story-continuation-sequence-field',
    );
  }
}

export function registerStoryContinuationBlock(labels: EditorLabels = currentLabels): void {
  currentLabels = labels;
  if (Blockly.Blocks[STORY_CONTINUATION_BLOCK_TYPE]) {
    return;
  }

  Blockly.Blocks[STORY_CONTINUATION_BLOCK_TYPE] = {
    init(): void {
      this.appendDummyInput()
        .appendField(currentLabels.blockly.continuation, LABEL_FIELD)
        .appendField(
          new StoryContinuationSequenceField(
            1,
            1,
            null,
            1,
          ),
          STORY_CONTINUATION_BLOCK_FIELDS.sequence,
        );
      // 延伸是新分页的页首：上方封闭，只保留向下的连接口。
      // 这样后续剧情会永久连在它下方，不会再显示成页尾标记。
      this.setNextStatement(true);
      this.setColour(55);
      this.setTooltip(currentLabels.blockly.continuationTooltip);
      this.setHelpUrl('');
    },
  };
}
