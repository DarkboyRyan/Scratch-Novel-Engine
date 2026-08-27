/**
 * 文件主要作用：限制单个对白积木拖动并维护故事序列连接。
 * 包含实现：`SingleDialogueBlockDragStrategy`。
 */

import * as Blockly from 'blockly';

// Blockly 默认拖动 statement 时会带走它下面的整串积木。
// 对白编辑器需要“一次只移动一句”，所以固定启用 healStack：
// 先把原位置的上一块和下一块接回去，再单独拖动当前积木。
export class SingleDialogueBlockDragStrategy extends Blockly.dragging.BlockDragStrategy {
  protected override shouldHealStack(): boolean {
    return true;
  }
}
