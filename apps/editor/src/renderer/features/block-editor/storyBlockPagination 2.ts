import type * as Blockly from 'blockly';

import type {
  SceneDocument,
  SceneNode,
} from '../../../shared/projectTypes';
import {
  getSceneStartBlockId,
  SCENE_START_BLOCK_TYPE,
} from './blocks/sceneStartBlock';

type StoryExtensionNode = Extract<
  SceneNode,
  { type: 'storyExtension' }
>;
type PlayableSceneNode = Exclude<SceneNode, StoryExtensionNode>;

export type StoryBlockPage = {
  nodes: PlayableSceneNode[];
  continuation:
    | {
        node: StoryExtensionNode;
        sequence: number;
      }
    | null;
};

// “延伸”是用户显式放入时间线的新分页页首，不按节点数量
// 自动生成。它之后、下一个延伸之前的正式节点都属于该页。
// SceneJump 仍是运行语义上的自然链尾，但不会占用延伸页序。
// 连续延伸和末尾延伸会保留为确定的 marker-only 页。
export function paginateStoryNodes(
  nodes: SceneNode[],
): StoryBlockPage[] {
  const pages: StoryBlockPage[] = [];
  let pageNodes: PlayableSceneNode[] = [];
  let continuation: StoryBlockPage['continuation'] = null;
  let extensionSequence = 0;

  const pushCurrentPage = (): void => {
    if (pageNodes.length === 0 && continuation === null) {
      return;
    }
    pages.push({ nodes: pageNodes, continuation });
    pageNodes = [];
    continuation = null;
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (node.type === 'storyExtension') {
      pushCurrentPage();
      extensionSequence += 1;
      continuation = { node, sequence: extensionSequence };
      continue;
    }

    pageNodes.push(node);
    if (
      node.type === 'sceneJump' &&
      index + 1 < nodes.length
    ) {
      pushCurrentPage();
    }
  }

  pushCurrentPage();

  return pages;
}

// 拖放可能在不改变权威节点顺序的情况下改变 Blockly 的物理连接。
// 只有每个手动分段仍与 Scene 顺序完全一致时，语义 no-op 才能保留；
// 否则调用方应从最后一次 C++ 快照恢复规范投影。
export function isStoryPaginationProjectionConsistent(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
): boolean {
  const pages = paginateStoryNodes(scene.nodes);
  const startBlock = workspace.getBlockById(
    getSceneStartBlockId(scene.id),
  );
  const hasProjectedStart = startBlock?.type === SCENE_START_BLOCK_TYPE;
  const expectedStartNextId =
    pages[0]?.continuation === null ? pages[0].nodes[0]?.id ?? null : null;

  if (
    hasProjectedStart &&
    (startBlock.getPreviousBlock() !== null ||
      (startBlock.getNextBlock()?.id ?? null) !== expectedStartNextId)
  ) {
    return false;
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    const expectedBlockIds = [
      ...(page.continuation ? [page.continuation.node.id] : []),
      ...page.nodes.map((node) => node.id),
    ];

    for (let index = 0; index < expectedBlockIds.length; index += 1) {
      const block = workspace.getBlockById(expectedBlockIds[index]);
      if (!block) {
        return false;
      }

      const expectedPreviousId =
        expectedBlockIds[index - 1] ??
        (hasProjectedStart &&
        pageIndex === 0 &&
        page.continuation === null
          ? startBlock.id
          : null);
      const expectedNextId = expectedBlockIds[index + 1] ?? null;
      if (
        (block.getPreviousBlock()?.id ?? null) !== expectedPreviousId ||
        (block.getNextBlock()?.id ?? null) !== expectedNextId
      ) {
        return false;
      }
    }
  }

  return true;
}
