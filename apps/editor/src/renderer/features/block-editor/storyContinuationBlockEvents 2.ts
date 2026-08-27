import * as Blockly from 'blockly';

import type { TimelineReorderManyParams } from '../../../shared/engineProtocol';
import type {
  SceneDocument,
  StoryExtensionNode,
} from '../../../shared/projectTypes';
import {
  getStoryContinuationBlockSequence,
  STORY_CONTINUATION_BLOCK_FIELDS,
  STORY_CONTINUATION_BLOCK_TYPE,
} from './blocks/storyContinuationBlock';

export type StoryContinuationSequenceResolution =
  | {
      kind: 'reorder-page';
      params: TimelineReorderManyParams;
    }
  | {
      kind: 'restore-projection';
    };

type ExtensionPage = {
  extension: StoryExtensionNode;
  nodeIds: string[];
};

function getExtensionPages(scene: SceneDocument): ExtensionPage[] {
  const extensionIndexes = scene.nodes.flatMap((node, index) =>
    node.type === 'storyExtension' ? [index] : [],
  );

  return extensionIndexes.map((startIndex, pageIndex) => ({
    extension: scene.nodes[startIndex] as StoryExtensionNode,
    // 页内容是该延伸自身，以及下一个延伸之前的所有节点。
    // 即使其中含 SceneJump，调整页序时也必须原子移动整段。
    nodeIds: scene.nodes
      .slice(
        startIndex,
        extensionIndexes[pageIndex + 1] ?? scene.nodes.length,
      )
      .map((node) => node.id),
  }));
}

export function buildStoryContinuationPageReorder(
  scene: SceneDocument,
  extensionNodeId: string,
  targetSequence: number,
): StoryContinuationSequenceResolution | null {
  const pages = getExtensionPages(scene);
  const currentIndex = pages.findIndex(
    (page) => page.extension.id === extensionNodeId,
  );

  if (
    currentIndex < 0 ||
    !Number.isInteger(targetSequence) ||
    targetSequence < 1 ||
    targetSequence > pages.length
  ) {
    return { kind: 'restore-projection' };
  }

  const targetIndex = targetSequence - 1;
  if (targetIndex === currentIndex) {
    return null;
  }

  const movingPage = pages[currentIndex];
  // 向前移时放到目标页的 marker 之前；向后移时放到目标页
  // 整段之后，也就是原顺序中目标页的下一个 marker 之前。
  const beforeNodeId =
    targetIndex < currentIndex
      ? pages[targetIndex].extension.id
      : pages[targetIndex + 1]?.extension.id ?? null;

  return {
    kind: 'reorder-page',
    params: {
      sceneId: scene.id,
      nodeIds: movingPage.nodeIds,
      beforeNodeId,
    },
  };
}

function getBlockSequenceResolution(
  block: Blockly.Block,
  scene: SceneDocument,
): StoryContinuationSequenceResolution | null {
  return buildStoryContinuationPageReorder(
    scene,
    block.id,
    getStoryContinuationBlockSequence(block),
  );
}

export function getStoryContinuationSequenceUpdate(
  event: Blockly.Events.Abstract,
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): StoryContinuationSequenceResolution | null {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) {
    return null;
  }

  const changeEvent = event as Blockly.Events.BlockChange;
  if (
    changeEvent.element !== 'field' ||
    changeEvent.name !== STORY_CONTINUATION_BLOCK_FIELDS.sequence ||
    !changeEvent.blockId
  ) {
    return null;
  }

  const block = workspace.getBlockById(changeEvent.blockId);
  const node = scene.nodes.find(
    (candidate) => candidate.id === changeEvent.blockId,
  );
  if (
    block?.type !== STORY_CONTINUATION_BLOCK_TYPE ||
    node?.type !== 'storyExtension'
  ) {
    return null;
  }

  return getBlockSequenceResolution(block, scene);
}

// 项目保存时可能数字输入框仍在聚焦中，所以与对白草稿一样
// 直接读取 FieldNumber 的当前值，不依赖最终 BLOCK_CHANGE。
export function collectStoryContinuationSequenceDraft(
  workspace: Blockly.WorkspaceSvg,
  scene: SceneDocument,
): StoryContinuationSequenceResolution | null {
  for (const node of scene.nodes) {
    if (node.type !== 'storyExtension') {
      continue;
    }
    const block = workspace.getBlockById(node.id);
    if (block?.type !== STORY_CONTINUATION_BLOCK_TYPE) {
      continue;
    }
    const resolution = getBlockSequenceResolution(block, scene);
    if (resolution !== null) {
      return resolution;
    }
  }

  return null;
}
