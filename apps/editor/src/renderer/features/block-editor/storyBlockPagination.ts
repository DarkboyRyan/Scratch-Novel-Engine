import type * as Blockly from 'blockly';

import type {
  SceneDocument,
  SceneNode,
} from '../../../shared/projectTypes';
import {
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
} from './blocks/logicControlBlock';
import {
  getSceneStartBlockId,
  SCENE_START_BLOCK_TYPE,
} from './blocks/sceneStartBlock';
import {
  parseLogicStructure,
  type LogicStructureItem,
} from './logicStructure';

type StoryExtensionNode = Extract<
  SceneNode,
  { type: 'storyExtension' }
>;
type HiddenLogicMarker = Extract<
  SceneNode,
  { type: 'logicElse' | 'logicEndIf' | 'logicEndRepeat' }
>;
type PlayableSceneNode = Exclude<
  SceneNode,
  StoryExtensionNode | HiddenLogicMarker
>;

export type StoryBlockPage = {
  nodes: PlayableSceneNode[];
  continuation:
    | {
        node: StoryExtensionNode;
        sequence: number;
      }
    | null;
};

type StructuredPage = {
  items: LogicStructureItem[];
  continuation: StoryBlockPage['continuation'];
};

function visibleNodes(items: LogicStructureItem[]): PlayableSceneNode[] {
  return items.flatMap((item): PlayableSceneNode[] => {
    if (item.kind === 'node') {
      return item.node.type === 'storyExtension' ? [] : [item.node];
    }
    if (item.kind === 'if') {
      return [
        item.node,
        ...visibleNodes(item.thenItems),
        ...visibleNodes(item.elseItems),
      ];
    }
    return [item.node, ...visibleNodes(item.bodyItems)];
  });
}

function paginateStructure(items: LogicStructureItem[]): StructuredPage[] {
  const pages: StructuredPage[] = [];
  let pageItems: LogicStructureItem[] = [];
  let continuation: StructuredPage['continuation'] = null;
  let extensionSequence = 0;

  const pushCurrentPage = (): void => {
    if (pageItems.length === 0 && continuation === null) {
      return;
    }
    pages.push({ items: pageItems, continuation });
    pageItems = [];
    continuation = null;
  };

  for (const item of items) {
    if (item.kind === 'node' && item.node.type === 'storyExtension') {
      pushCurrentPage();
      extensionSequence += 1;
      continuation = { node: item.node, sequence: extensionSequence };
      continue;
    }

    pageItems.push(item);
    // A jump nested in an If/Repeat is not an unconditional visual page end.
    if (item.kind === 'node' && item.node.type === 'sceneJump') {
      pushCurrentPage();
    }
  }

  pushCurrentPage();
  return pages;
}

// Extension is a top-level author-controlled page header. Logic markers remain
// invisible, while nested visible nodes are included for layout completeness.
export function paginateStoryNodes(
  nodes: SceneNode[],
): StoryBlockPage[] {
  return paginateStructure(parseLogicStructure({ nodes })).map((page) => ({
    nodes: visibleNodes(page.items),
    continuation: page.continuation,
  }));
}

function isItemChainConsistent(
  items: LogicStructureItem[],
  workspace: Blockly.WorkspaceSvg,
  expectedParentId: string | null,
): boolean {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const block = workspace.getBlockById(item.node.id);
    if (!block) {
      return false;
    }

    const expectedPreviousId =
      index === 0 ? expectedParentId : items[index - 1].node.id;
    const expectedNextId = items[index + 1]?.node.id ?? null;
    if (
      (block.getPreviousBlock()?.id ?? null) !== expectedPreviousId ||
      (block.getNextBlock()?.id ?? null) !== expectedNextId
    ) {
      return false;
    }

    if (item.kind === 'if') {
      if (block.type !== LOGIC_IF_BLOCK_TYPE) {
        return false;
      }
      const thenFirstId = item.thenItems[0]?.node.id ?? null;
      const elseFirstId = item.elseItems[0]?.node.id ?? null;
      if (
        (block.getInputTargetBlock(LOGIC_CONTROL_INPUTS.then)?.id ?? null) !==
          thenFirstId ||
        (block.getInputTargetBlock(LOGIC_CONTROL_INPUTS.else)?.id ?? null) !==
          elseFirstId ||
        !isItemChainConsistent(item.thenItems, workspace, block.id) ||
        !isItemChainConsistent(item.elseItems, workspace, block.id)
      ) {
        return false;
      }
    } else if (item.kind === 'repeat') {
      if (
        block.type !== LOGIC_REPEAT_BLOCK_TYPE ||
        (block.getInputTargetBlock(LOGIC_CONTROL_INPUTS.body)?.id ?? null) !==
          (item.bodyItems[0]?.node.id ?? null) ||
        !isItemChainConsistent(item.bodyItems, workspace, block.id)
      ) {
        return false;
      }
    }
  }
  return true;
}

// Dragging can mutate Blockly topology before the backend accepts it. This
// verifies both page roots and every C-block branch against the last snapshot.
export function isStoryPaginationProjectionConsistent(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
): boolean {
  let pages: StructuredPage[];
  try {
    pages = paginateStructure(parseLogicStructure(scene));
  } catch {
    return false;
  }

  const startBlock = workspace.getBlockById(
    getSceneStartBlockId(scene.id),
  );
  const hasProjectedStart = startBlock?.type === SCENE_START_BLOCK_TYPE;
  const expectedStartNextId =
    pages[0]?.continuation === null
      ? pages[0].items[0]?.node.id ?? null
      : null;
  if (
    hasProjectedStart &&
    (startBlock.getPreviousBlock() !== null ||
      (startBlock.getNextBlock()?.id ?? null) !== expectedStartNextId)
  ) {
    return false;
  }

  return pages.every((page, pageIndex) => {
    const continuationBlock = page.continuation
      ? workspace.getBlockById(page.continuation.node.id)
      : null;
    if (
      page.continuation &&
      (!continuationBlock ||
        continuationBlock.getPreviousBlock() !== null ||
        (continuationBlock.getNextBlock()?.id ?? null) !==
          (page.items[0]?.node.id ?? null))
    ) {
      return false;
    }

    const expectedParentId = page.continuation?.node.id ??
      (pageIndex === 0 && hasProjectedStart ? startBlock.id : null);
    return isItemChainConsistent(
      page.items,
      workspace,
      expectedParentId,
    );
  });
}
