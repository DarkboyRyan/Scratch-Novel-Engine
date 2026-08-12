import * as Blockly from 'blockly';

import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';

type DeleteRequest = (draggedNodeId: string | null) => void;
type PersistedDialogueCheck = (nodeId: string) => boolean;

// Blockly 原生垃圾桶会先从画布删除，再通知监听器。这里改成
// backend-first：先让积木回到原位，再请求 C++ 删除并等待新快照。
export class EngineTrashcan extends Blockly.Trashcan {
  private suppressClickUntil = 0;
  private hasDialogueHover = false;

  constructor(
    workspace: Blockly.WorkspaceSvg,
    private readonly requestDelete: DeleteRequest,
    private readonly isPersistedDialogue: PersistedDialogueCheck,
  ) {
    super(workspace);
  }

  private isDialogue(
    draggable: Blockly.IDraggable,
  ): draggable is Blockly.BlockSvg {
    return (
      draggable instanceof Blockly.BlockSvg &&
      draggable.type === DIALOGUE_BLOCK_TYPE
    );
  }

  override wouldDelete(draggable: Blockly.IDraggable): boolean {
    const isDialogue = this.isDialogue(draggable);
    this.updateWouldDelete_(isDialogue);

    // 工具箱中的临时积木尚未进入 C++，可交给 Blockly 原生销毁；
    // 正式积木必须等待 backend-first 删除成功后重绘。
    return (
      isDialogue &&
      !this.isPersistedDialogue(draggable.id)
    );
  }

  override shouldPreventMove(draggable: Blockly.IDraggable): boolean {
    return (
      this.isDialogue(draggable) &&
      this.isPersistedDialogue(draggable.id)
    );
  }

  override onDragEnter(draggable: Blockly.IDraggable): void {
    super.onDragEnter(draggable);
    this.hasDialogueHover = this.isDialogue(draggable);
  }

  override onDragOver(draggable: Blockly.IDraggable): void {
    this.hasDialogueHover = this.isDialogue(draggable);
    this.setLidOpen(this.hasDialogueHover);
  }

  override onDragExit(draggable: Blockly.IDraggable): void {
    super.onDragExit(draggable);
    this.hasDialogueHover = false;
    this.setLidOpen(false);
  }

  override onDrop(draggable: Blockly.IDraggable): void {
    super.onDrop(draggable);

    if (!this.isDialogue(draggable)) {
      return;
    }

    this.hasDialogueHover = false;
    this.setLidOpen(false);
    this.suppressClickUntil = Math.max(
      this.suppressClickUntil,
      performance.now() + 250,
    );

    if (this.isPersistedDialogue(draggable.id)) {
      this.requestDelete(draggable.id);
    }
  }

  override click(): void {
    if (
      this.hasDialogueHover ||
      performance.now() < this.suppressClickUntil
    ) {
      return;
    }

    // 点击图标删除当前选择；null 表示没有“被拖入”的特定积木。
    this.requestDelete(null);
  }
}
