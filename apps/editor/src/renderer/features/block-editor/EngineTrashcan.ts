import * as Blockly from 'blockly';

import { isStoryBlockType } from './storyBlockTypes';
import { CHOICE_OPTION_BLOCK_TYPE } from './blocks/choiceBlock';

type DeleteRequest = (draggedNodeId: string | null) => void;
type PersistedNodeCheck = (nodeId: string) => boolean;

// Blockly 原生垃圾桶会先从画布删除，再通知监听器。这里改成
// backend-first：先让积木回到原位，再请求 C++ 删除并等待新快照。
export class EngineTrashcan extends Blockly.Trashcan {
  private suppressClickUntil = 0;
  private hasStoryBlockHover = false;

  constructor(
    workspace: Blockly.WorkspaceSvg,
    private readonly requestDelete: DeleteRequest,
    private readonly isPersistedNode: PersistedNodeCheck,
  ) {
    super(workspace);
  }

  override createDom(): SVGElement {
    const group = super.createDom();

    // Blockly's stock trashcan is a clipped sprite sheet. It can look like an
    // unrelated/broken image when the media path is unavailable in a packaged
    // Electron build. Replace only that artwork with an inline SVG bin while
    // keeping Blockly's positioning, focus and drag-target behaviour.
    group
      .querySelectorAll('image, clipPath, .blocklyTrashLid')
      .forEach((element) => element.remove());

    const body = Blockly.utils.dom.createSvgElement<SVGGElement>(
      'g',
      { class: 'vn-engine-trash-body', 'aria-hidden': 'true' },
      group,
    );
    Blockly.utils.dom.createSvgElement<SVGPathElement>(
      'path',
      { d: 'M11 18h25l-3 39H14z' },
      body,
    );
    for (const x of [18, 24, 30]) {
      Blockly.utils.dom.createSvgElement<SVGLineElement>(
        'line',
        { x1: x, y1: 25, x2: x, y2: 50 },
        body,
      );
    }

    const lid = Blockly.utils.dom.createSvgElement<SVGGElement>(
      'g',
      {
        class: 'blocklyTrashLid vn-engine-trash-lid',
        'aria-hidden': 'true',
      },
      group,
    );
    Blockly.utils.dom.createSvgElement<SVGPathElement>(
      'path',
      { d: 'M17 6h13l2 5h7v6H8v-6h7z' },
      lid,
    );

    return group;
  }

  private isManagedBlock(
    draggable: Blockly.IDraggable,
  ): draggable is Blockly.BlockSvg {
    return (
      draggable instanceof Blockly.BlockSvg &&
      (isStoryBlockType(draggable.type) ||
        draggable.type === CHOICE_OPTION_BLOCK_TYPE)
    );
  }

  override wouldDelete(draggable: Blockly.IDraggable): boolean {
    const isManagedBlock = this.isManagedBlock(draggable);
    this.updateWouldDelete_(isManagedBlock);

    // 工具箱中的临时积木尚未进入 C++，可交给 Blockly 原生销毁；
    // 正式积木必须等待 backend-first 删除成功后重绘。
    return (
      isManagedBlock &&
      !this.isPersistedNode(draggable.id)
    );
  }

  override shouldPreventMove(draggable: Blockly.IDraggable): boolean {
    return (
      this.isManagedBlock(draggable) &&
      this.isPersistedNode(draggable.id)
    );
  }

  override onDragEnter(draggable: Blockly.IDraggable): void {
    super.onDragEnter(draggable);
    this.hasStoryBlockHover = this.isManagedBlock(draggable);
  }

  override onDragOver(draggable: Blockly.IDraggable): void {
    this.hasStoryBlockHover = this.isManagedBlock(draggable);
    this.setLidOpen(this.hasStoryBlockHover);
  }

  override onDragExit(draggable: Blockly.IDraggable): void {
    super.onDragExit(draggable);
    this.hasStoryBlockHover = false;
    this.setLidOpen(false);
  }

  override onDrop(draggable: Blockly.IDraggable): void {
    super.onDrop(draggable);

    if (!this.isManagedBlock(draggable)) {
      return;
    }

    this.hasStoryBlockHover = false;
    this.setLidOpen(false);
    this.suppressClickUntil = Math.max(
      this.suppressClickUntil,
      performance.now() + 250,
    );

    if (this.isPersistedNode(draggable.id)) {
      this.requestDelete(draggable.id);
    }
  }

  override click(): void {
    if (
      this.hasStoryBlockHover ||
      performance.now() < this.suppressClickUntil
    ) {
      return;
    }

    // 点击图标删除当前选择；null 表示没有“被拖入”的特定积木。
    this.requestDelete(null);
  }
}
