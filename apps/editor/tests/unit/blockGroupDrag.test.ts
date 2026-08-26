/** @vitest-environment jsdom */

import type * as Blockly from 'blockly';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBlockGroupDragController,
  getBlockGroupSelectionMode,
} from '../../src/renderer/features/block-editor/blockGroupDrag';
import type { BlockSelectionController } from '../../src/renderer/features/block-editor/blockSelection';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import {
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';
import { STORY_CONTINUATION_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/storyContinuationBlock';
import type { SceneDocument } from '../../src/shared/projectTypes';

const logicScene: SceneDocument = {
  schemaVersion: 1,
  id: 'logic-selection-scene',
  name: 'Logic selection',
  backgroundAssetId: null,
  nodes: [
    {
      id: 'top-1',
      type: 'dialogue',
      speaker: 'A',
      text: 'One',
      voiceAssetId: null,
    },
    {
      id: 'top-2',
      type: 'dialogue',
      speaker: 'A',
      text: 'Two',
      voiceAssetId: null,
    },
    {
      id: 'if-1',
      type: 'logicIf',
      condition: {
        left: { kind: 'variable', name: 'route' },
        operator: 'eq',
        right: { kind: 'literal', value: 'A' },
      },
    },
    {
      id: 'then-line',
      type: 'dialogue',
      speaker: 'B',
      text: 'Then',
      voiceAssetId: null,
    },
    { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
    { id: 'repeat-1', type: 'logicRepeat', count: 2 },
    {
      id: 'repeat-line',
      type: 'dialogue',
      speaker: 'C',
      text: 'Repeat',
      voiceAssetId: null,
    },
    {
      id: 'endrepeat-1',
      type: 'logicEndRepeat',
      repeatNodeId: 'repeat-1',
    },
    { id: 'endif-1', type: 'logicEndIf', ifNodeId: 'if-1' },
    { id: 'extension-1', type: 'storyExtension' },
    {
      id: 'tail-line',
      type: 'dialogue',
      speaker: 'D',
      text: 'Tail',
      voiceAssetId: null,
    },
  ],
};

const visibleNodeIds = [
  'top-1',
  'top-2',
  'if-1',
  'then-line',
  'repeat-1',
  'repeat-line',
  'extension-1',
  'tail-line',
];

function workspaceWithProjectedBlocks(): Blockly.WorkspaceSvg {
  const blockTypes = new Map<string, string>([
    ['top-1', DIALOGUE_BLOCK_TYPE],
    ['top-2', DIALOGUE_BLOCK_TYPE],
    ['if-1', LOGIC_IF_BLOCK_TYPE],
    ['then-line', DIALOGUE_BLOCK_TYPE],
    ['repeat-1', LOGIC_REPEAT_BLOCK_TYPE],
    ['repeat-line', DIALOGUE_BLOCK_TYPE],
    ['extension-1', STORY_CONTINUATION_BLOCK_TYPE],
    ['tail-line', DIALOGUE_BLOCK_TYPE],
  ]);
  return {
    getBlockById: (nodeId: string) => {
      const type = blockTypes.get(nodeId);
      return type ? { id: nodeId, type } : null;
    },
    isDragging: () => false,
    getScale: () => 1,
  } as unknown as Blockly.WorkspaceSvg;
}

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event as PointerEvent;
}

function rectangle(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 400,
    width: 600,
    height: 400,
    toJSON: () => ({}),
  };
}

function mountController(selectedNodeIds: string[]) {
  const container = document.createElement('div');
  const background = document.createElement('div');
  background.className = 'blocklyMainBackground';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const selectedBlock = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'g',
  );
  selectedBlock.classList.add('blocklyBlock');
  selectedBlock.setAttribute('data-id', selectedNodeIds[0] ?? 'top-1');
  svg.append(selectedBlock);
  container.append(background, svg);
  document.body.append(container);
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rectangle());
  vi.spyOn(background, 'getBoundingClientRect').mockReturnValue(rectangle());
  Object.defineProperty(container, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => background,
  });

  const onMoveAll = vi.fn();
  const onReorder = vi.fn();
  const onDelete = vi.fn();
  const selection = {
    getSelectedNodeIds: () => selectedNodeIds,
    selectOnly: vi.fn(),
    syncScene: vi.fn(),
    dispose: vi.fn(),
  } satisfies BlockSelectionController;
  const controller = createBlockGroupDragController(
    container,
    workspaceWithProjectedBlocks(),
    () => logicScene,
    selection,
    {
      canStart: () => true,
      onDelete,
      onMoveAll,
      onReorder,
    },
  );

  return {
    container,
    selectedBlock,
    controller,
    onDelete,
    onMoveAll,
    onReorder,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('logic-aware block group selection', () => {
  it('compares the exact projected selectable ID set', () => {
    const workspace = workspaceWithProjectedBlocks();

    expect(
      getBlockGroupSelectionMode(logicScene, workspace, visibleNodeIds),
    ).toBe('move-all-layout');
    expect(
      getBlockGroupSelectionMode(logicScene, workspace, ['top-1', 'top-2']),
    ).toBe('reorder-timeline');
    expect(
      getBlockGroupSelectionMode(logicScene, workspace, [
        'extension-1',
        'tail-line',
      ]),
    ).toBe('reject-extension-selection');

    const sameLengthButWrongIds = [
      ...visibleNodeIds.slice(0, -1),
      'else-1',
    ];
    expect(sameLengthButWrongIds).toHaveLength(visibleNodeIds.length);
    expect(
      getBlockGroupSelectionMode(
        logicScene,
        workspace,
        sameLengthButWrongIds,
      ),
    ).not.toBe('move-all-layout');
  });

  it('moves layout when every visible If/Repeat page block is selected', () => {
    const mounted = mountController(visibleNodeIds);

    mounted.selectedBlock.dispatchEvent(pointerEvent('pointerdown', 7, 40, 40));
    window.dispatchEvent(pointerEvent('pointermove', 7, 80, 100));
    window.dispatchEvent(pointerEvent('pointerup', 7, 80, 100));

    expect(mounted.onMoveAll).toHaveBeenCalledWith(40, 60);
    expect(mounted.onReorder).not.toHaveBeenCalled();
    expect(mounted.onDelete).not.toHaveBeenCalled();
    mounted.controller.dispose();
  });

  it('still rejects a partial selection containing an Extension block', () => {
    const mounted = mountController(['extension-1', 'tail-line']);

    mounted.selectedBlock.dispatchEvent(pointerEvent('pointerdown', 8, 40, 40));

    expect(mounted.controller.isActive()).toBe(false);
    expect(mounted.onMoveAll).not.toHaveBeenCalled();
    expect(mounted.onReorder).not.toHaveBeenCalled();
    expect(mounted.onDelete).not.toHaveBeenCalled();
    mounted.controller.dispose();
  });
});
