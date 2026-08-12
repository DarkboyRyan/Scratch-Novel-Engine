import * as Blockly from 'blockly';

import type { ReorderDialoguesParams } from '../../../shared/engineProtocol';
import type { SceneDocument } from '../../../shared/projectTypes';
import {
  getBlockClientRectangle,
  type BlockSelectionController,
} from './blockSelection';
import {
  buildGroupReorderParams,
  getDialogueDropSlotForPoint,
  type DialogueDropTarget,
} from './dialogueGroupReorder';

const DRAG_THRESHOLD_PX = 5;

type GroupDragCallbacks = {
  canStart(): boolean;
  onDelete(): void;
  onMoveAll(deltaX: number, deltaY: number): void;
  onReorder(params: ReorderDialoguesParams): void;
};

export type BlockGroupDragController = {
  cancel(): void;
  dispose(): void;
  isActive(): boolean;
};

type ActiveGesture = {
  pointerId: number;
  sceneId: string;
  nodeId: string;
  selectedNodeIds: string[];
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
  ghost: HTMLDivElement | null;
  indicator: HTMLDivElement | null;
  outcome:
    | { kind: 'delete' }
    | { kind: 'move-all' }
    | { kind: 'reorder'; params: ReorderDialoguesParams }
    | null;
};

function containsPoint(rectangle: DOMRect, x: number, y: number): boolean {
  return (
    x >= rectangle.left &&
    x <= rectangle.right &&
    y >= rectangle.top &&
    y <= rectangle.bottom
  );
}

function largestElementRectangle(
  container: HTMLElement,
  selector: string,
): DOMRect | null {
  const rectangles = [...container.querySelectorAll(selector)]
    .map((element) => element.getBoundingClientRect())
    .filter((rectangle) => rectangle.width > 0 && rectangle.height > 0);

  return (
    rectangles.sort(
      (first, second) =>
        second.width * second.height - first.width * first.height,
    )[0] ?? null
  );
}

export function createBlockGroupDragController(
  container: HTMLDivElement,
  workspace: Blockly.WorkspaceSvg,
  getScene: () => SceneDocument,
  selection: BlockSelectionController,
  callbacks: GroupDragCallbacks,
): BlockGroupDragController {
  let activeGesture: ActiveGesture | null = null;

  const removeGestureListeners = () => {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('blur', onWindowBlur, true);
    container.removeEventListener(
      'lostpointercapture',
      onLostPointerCapture,
    );
  };

  const clearGesture = () => {
    const gesture = activeGesture;
    // releasePointerCapture 会同步触发 lostpointercapture；先清状态以避免重入。
    activeGesture = null;
    removeGestureListeners();
    if (
      gesture &&
      container.hasPointerCapture(gesture.pointerId)
    ) {
      try {
        container.releasePointerCapture(gesture.pointerId);
      } catch {
        // 窗口失焦时浏览器可能已经释放捕获，无需额外处理。
      }
    }
    gesture?.ghost?.remove();
    gesture?.indicator?.remove();
    container.classList.remove('vn-block-group-dragging');
  };

  const startGroupDrag = (gesture: ActiveGesture) => {
    gesture.isDragging = true;
    container.classList.add('vn-block-group-dragging');

    const ghost = document.createElement('div');
    ghost.className = 'vn-block-group-drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');

    const count = document.createElement('strong');
    count.textContent = `${gesture.selectedNodeIds.length} 条对白`;
    const hint = document.createElement('span');
    hint.textContent = '作为一组移动';
    ghost.append(count, hint);

    const indicator = document.createElement('div');
    indicator.className = 'vn-block-group-drop-indicator';
    indicator.setAttribute('aria-hidden', 'true');

    gesture.ghost = ghost;
    gesture.indicator = indicator;
    container.append(ghost, indicator);
  };

  const updateGroupDrag = (gesture: ActiveGesture) => {
    const scene = getScene();
    const containerRectangle = container.getBoundingClientRect();
    const backgroundRectangle = largestElementRectangle(
      container,
      '.blocklyMainBackground',
    );
    const trashRectangle = largestElementRectangle(
      container,
      '.blocklyTrash',
    );

    if (!gesture.ghost || !gesture.indicator || !backgroundRectangle) {
      return;
    }

    gesture.ghost.style.left = `${
      gesture.currentX - containerRectangle.left + 14
    }px`;
    gesture.ghost.style.top = `${
      gesture.currentY - containerRectangle.top + 14
    }px`;
    gesture.ghost.classList.remove(
      'is-delete-target',
      'is-invalid-target',
    );
    gesture.indicator.hidden = true;
    gesture.outcome = null;

    if (
      scene.id !== gesture.sceneId ||
      !gesture.selectedNodeIds.every((nodeId) =>
        scene.nodes.some((node) => node.id === nodeId),
      )
    ) {
      gesture.ghost.classList.add('is-invalid-target');
      return;
    }

    if (
      trashRectangle &&
      containsPoint(
        trashRectangle,
        gesture.currentX,
        gesture.currentY,
      )
    ) {
      gesture.ghost.classList.add('is-delete-target');
      gesture.outcome = { kind: 'delete' };
      return;
    }

    const elementAtPointer = document.elementFromPoint(
      gesture.currentX,
      gesture.currentY,
    );
    const isOverWorkspaceControl =
      elementAtPointer instanceof Element &&
      elementAtPointer.closest(
        '.blocklyToolbox, .blocklyFlyout, .blocklyScrollbarHorizontal, .blocklyScrollbarVertical, .blocklyZoom',
      ) !== null;

    if (
      isOverWorkspaceControl ||
      !containsPoint(
        backgroundRectangle,
        gesture.currentX,
        gesture.currentY,
      )
    ) {
      gesture.ghost.classList.add('is-invalid-target');
      return;
    }

    if (gesture.selectedNodeIds.length === scene.nodes.length) {
      gesture.outcome = { kind: 'move-all' };
      return;
    }

    const selectedIds = new Set(gesture.selectedNodeIds);
    const targets = scene.nodes.flatMap<DialogueDropTarget>((node) => {
      if (selectedIds.has(node.id)) {
        return [];
      }

      const block = workspace.getBlockById(node.id);
      if (!(block instanceof Blockly.BlockSvg)) {
        return [];
      }

      const rectangle = getBlockClientRectangle(block, workspace);
      return [
        {
          nodeId: node.id,
          left: rectangle.left,
          right: rectangle.right,
          top: rectangle.top,
          bottom: rectangle.bottom,
        },
      ];
    });
    const dropSlot = getDialogueDropSlotForPoint(
      targets,
      gesture.currentX,
      gesture.currentY,
    );
    const params = dropSlot
      ? buildGroupReorderParams(
          scene,
          gesture.selectedNodeIds,
          dropSlot.beforeNodeId,
        )
      : null;

    if (dropSlot && params && targets.length > 0) {
      const anchor =
        dropSlot.beforeNodeId === null
          ? targets[targets.length - 1]
          : targets.find(
              (target) =>
                target.nodeId === dropSlot.beforeNodeId,
            );
      const blocks = targets
        .map((target) => workspace.getBlockById(target.nodeId))
        .filter(
          (block): block is Blockly.BlockSvg =>
            block instanceof Blockly.BlockSvg,
        );
      const rectangles = blocks.map((block) =>
        getBlockClientRectangle(block, workspace),
      );
      const left = Math.min(...rectangles.map((rectangle) => rectangle.left));
      const right = Math.max(...rectangles.map((rectangle) => rectangle.right));
      const top =
        dropSlot.beforeNodeId === null
          ? anchor?.bottom
          : anchor?.top;

      if (top !== undefined) {
        gesture.indicator.hidden = false;
        gesture.indicator.style.left = `${left - containerRectangle.left}px`;
        gesture.indicator.style.top = `${top - containerRectangle.top}px`;
        gesture.indicator.style.width = `${right - left}px`;
      }
    }

    if (params) {
      gesture.outcome = { kind: 'reorder', params };
    } else {
      gesture.ghost.classList.add('is-invalid-target');
    }
  };

  function onPointerMove(event: PointerEvent) {
    const gesture = activeGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    gesture.currentX = event.clientX;
    gesture.currentY = event.clientY;

    if (
      !gesture.isDragging &&
      Math.hypot(
        gesture.currentX - gesture.startX,
        gesture.currentY - gesture.startY,
      ) > DRAG_THRESHOLD_PX
    ) {
      startGroupDrag(gesture);
    }

    if (gesture.isDragging) {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateGroupDrag(gesture);
    }
  }

  function onPointerUp(event: PointerEvent) {
    const gesture = activeGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    gesture.currentX = event.clientX;
    gesture.currentY = event.clientY;

    if (!gesture.isDragging) {
      const block = workspace.getBlockById(gesture.nodeId);
      selection.selectOnly(gesture.nodeId);
      if (block instanceof Blockly.BlockSvg) {
        Blockly.getFocusManager().focusNode(block);
      }
      clearGesture();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    updateGroupDrag(gesture);
    const outcome = gesture.outcome;
    const deltaX = (gesture.currentX - gesture.startX) / workspace.getScale();
    const deltaY = (gesture.currentY - gesture.startY) / workspace.getScale();
    clearGesture();

    if (outcome?.kind === 'delete') {
      callbacks.onDelete();
    } else if (outcome?.kind === 'move-all') {
      callbacks.onMoveAll(deltaX, deltaY);
    } else if (outcome?.kind === 'reorder') {
      callbacks.onReorder(outcome.params);
    }
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === activeGesture?.pointerId) {
      clearGesture();
    }
  }

  function onLostPointerCapture(event: PointerEvent) {
    if (event.pointerId === activeGesture?.pointerId) {
      clearGesture();
    }
  }

  function onWindowBlur() {
    clearGesture();
  }

  function onWheel(event: WheelEvent) {
    if (!activeGesture) {
      return;
    }

    // 拖动期间固定缩放，保证屏幕位移到工作区位移的换算稳定。
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!activeGesture) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearGesture();
      return;
    }

    // 自定义 ghost 拖动不进入 Blockly 的 isDragging 状态；这里显式
    // 吞掉删除键，避免同一次手势同时发出 deleteMany 与 reorderMany。
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (
      event.button !== 0 ||
      activeGesture ||
      !callbacks.canStart() ||
      workspace.isDragging() ||
      Blockly.getFocusManager().ephemeralFocusTaken()
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || target.closest('.blocklyField')) {
      return;
    }

    const blockElement = target.closest<SVGGElement>('.blocklyBlock');
    const nodeId = blockElement?.getAttribute('data-id');
    const selectedNodeIds = selection.getSelectedNodeIds();
    const scene = getScene();

    if (
      !nodeId ||
      selectedNodeIds.length < 2 ||
      !selectedNodeIds.includes(nodeId) ||
      !scene.nodes.some((node) => node.id === nodeId)
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    activeGesture = {
      pointerId: event.pointerId,
      sceneId: scene.id,
      nodeId,
      selectedNodeIds,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      isDragging: false,
      ghost: null,
      indicator: null,
      outcome: null,
    };

    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      // 某些合成 PointerEvent 没有关联的活动指针；window listener 仍可兜底。
    }

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('wheel', onWheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener('blur', onWindowBlur, true);
    container.addEventListener(
      'lostpointercapture',
      onLostPointerCapture,
    );
  };

  container.addEventListener('pointerdown', onPointerDown, true);

  return {
    cancel: clearGesture,
    dispose() {
      container.removeEventListener('pointerdown', onPointerDown, true);
      clearGesture();
    },
    isActive() {
      return activeGesture !== null;
    },
  };
}
