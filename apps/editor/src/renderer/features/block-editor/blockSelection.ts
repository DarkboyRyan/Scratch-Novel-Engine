import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';
import { BACKGROUND_BLOCK_TYPE } from './blocks/backgroundBlock';
import { CHARACTER_BLOCK_TYPE } from './blocks/characterBlock';

const LONG_PRESS_MS = 450;
// Blockly 自己的鼠标手势阈值是 5px；这里略小，避免短拖结束后
// 长按计时器又切换为框选。
const MOVE_TOLERANCE_PX = 4;
const MULTI_SELECTED_CLASS = 'vn-block-multi-selected';

export type BlockSelectionController = {
  dispose(): void;
  getSelectedNodeIds(): string[];
  selectOnly(nodeId?: string): void;
  syncScene(scene: SceneDocument): void;
};

function rectanglesIntersect(
  first: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
  second: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
): boolean {
  return !(
    first.right < second.left ||
    first.left > second.right ||
    first.bottom < second.top ||
    first.top > second.bottom
  );
}

export function getBlockClientRectangle(
  block: Blockly.BlockSvg,
  workspace: Blockly.WorkspaceSvg,
) {
  // SVG group 的 getBoundingClientRect 会包含整条 next 链；这个 Blockly
  // API 只计算当前积木，再把工作区坐标转换为屏幕坐标。
  const workspaceRectangle =
    block.getBoundingRectangleWithoutChildren();
  const topLeft = Blockly.utils.svgMath.wsToScreenCoordinates(
    workspace,
    new Blockly.utils.Coordinate(
      workspaceRectangle.left,
      workspaceRectangle.top,
    ),
  );
  const bottomRight = Blockly.utils.svgMath.wsToScreenCoordinates(
    workspace,
    new Blockly.utils.Coordinate(
      workspaceRectangle.right,
      workspaceRectangle.bottom,
    ),
  );

  return {
    left: Math.min(topLeft.x, bottomRight.x),
    right: Math.max(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    bottom: Math.max(topLeft.y, bottomRight.y),
  };
}

// 多选只是编辑器 UI 状态，不写进 C++ Project。
export function createBlockSelectionController(
  container: HTMLDivElement,
  workspace: Blockly.WorkspaceSvg,
  initialScene: SceneDocument,
): BlockSelectionController {
  let scene = initialScene;
  let selectedNodeIds = new Set<string>();
  let longPressTimer: number | null = null;
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isLassoActive = false;
  let lassoElement: HTMLDivElement | null = null;

  const sceneNodeIds = () =>
    new Set(scene.nodes.map((node) => node.id));

  const storyBlocks = () =>
    [DIALOGUE_BLOCK_TYPE, BACKGROUND_BLOCK_TYPE, CHARACTER_BLOCK_TYPE]
      .flatMap((type) => workspace.getBlocksByType(type, false))
      .filter(
        (block): block is Blockly.BlockSvg =>
          block instanceof Blockly.BlockSvg,
      );

  const applySelection = () => {
    for (const block of storyBlocks()) {
      block
        .getSvgRoot()
        .classList.toggle(
          MULTI_SELECTED_CLASS,
          selectedNodeIds.has(block.id),
        );
    }
  };

  const removeWindowListeners = () => {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
  };

  const clearTimer = () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const removeLasso = () => {
    lassoElement?.remove();
    lassoElement = null;
    isLassoActive = false;
    container.classList.remove('vn-block-lasso-active');
  };

  const updateLasso = () => {
    if (!lassoElement) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const left = Math.min(startX, currentX) - containerRect.left;
    const top = Math.min(startY, currentY) - containerRect.top;

    lassoElement.style.left = `${left}px`;
    lassoElement.style.top = `${top}px`;
    lassoElement.style.width = `${Math.abs(currentX - startX)}px`;
    lassoElement.style.height = `${Math.abs(currentY - startY)}px`;
  };

  const beginLasso = () => {
    longPressTimer = null;
    isLassoActive = true;
    workspace.cancelCurrentGesture();
    container.classList.add('vn-block-lasso-active');

    lassoElement = document.createElement('div');
    lassoElement.className = 'vn-block-selection-rectangle';
    lassoElement.setAttribute('aria-hidden', 'true');
    container.appendChild(lassoElement);
    updateLasso();
  };

  const finishPointerGesture = (selectBlocks: boolean) => {
    clearTimer();
    removeWindowListeners();

    if (isLassoActive && selectBlocks) {
      const selectionRectangle = {
        left: Math.min(startX, currentX),
        right: Math.max(startX, currentX),
        top: Math.min(startY, currentY),
        bottom: Math.max(startY, currentY),
      };
      const validNodeIds = sceneNodeIds();
      const nextSelection = new Set<string>();

      for (const block of storyBlocks()) {
        if (
          validNodeIds.has(block.id) &&
          rectanglesIntersect(
            getBlockClientRectangle(block, workspace),
            selectionRectangle,
          )
        ) {
          nextSelection.add(block.id);
        }
      }

      selectedNodeIds = nextSelection;
      applySelection();
    }

    removeLasso();
    activePointerId = null;
  };

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    currentX = event.clientX;
    currentY = event.clientY;

    if (!isLassoActive) {
      const distance = Math.hypot(
        currentX - startX,
        currentY - startY,
      );

      if (distance > MOVE_TOLERANCE_PX) {
        // 普通短拖只取消长按候选；视角只能通过滚动条移动。
        finishPointerGesture(false);
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    updateLasso();
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    currentX = event.clientX;
    currentY = event.clientY;
    if (isLassoActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    finishPointerGesture(true);
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === activePointerId) {
      finishPointerGesture(false);
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    const isMainBackground =
      target instanceof Element &&
      target.closest('.blocklyMainBackground') !== null;

    if (
      event.button !== 0 ||
      activePointerId !== null ||
      !isMainBackground
    ) {
      return;
    }

    activePointerId = event.pointerId;
    // 普通点击空白会清除选择；如果继续长按拖框，pointerup 会设置新选择。
    selectedNodeIds.clear();
    applySelection();
    startX = event.clientX;
    startY = event.clientY;
    currentX = event.clientX;
    currentY = event.clientY;
    longPressTimer = window.setTimeout(beginLasso, LONG_PRESS_MS);

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
  };

  container.addEventListener('pointerdown', onPointerDown, true);

  return {
    dispose() {
      container.removeEventListener('pointerdown', onPointerDown, true);
      finishPointerGesture(false);
    },
    getSelectedNodeIds() {
      // 以剧情顺序返回，保证发送到 C++ 的命令稳定、容易测试。
      return scene.nodes
        .filter((node) => selectedNodeIds.has(node.id))
        .map((node) => node.id);
    },
    selectOnly(nodeId) {
      const validNodeIds = sceneNodeIds();
      selectedNodeIds =
        nodeId && validNodeIds.has(nodeId)
          ? new Set([nodeId])
          : new Set();
      applySelection();
    },
    syncScene(nextScene) {
      const sceneChanged = scene.id !== nextScene.id;
      scene = nextScene;

      if (sceneChanged) {
        selectedNodeIds.clear();
      } else {
        const validNodeIds = sceneNodeIds();
        selectedNodeIds = new Set(
          [...selectedNodeIds].filter((nodeId) =>
            validNodeIds.has(nodeId),
          ),
        );
      }

      applySelection();
    },
  };
}
