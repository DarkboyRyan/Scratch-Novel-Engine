import type * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import { isStoryBlockType } from './storyBlockTypes';
import { paginateStoryNodes } from './storyBlockPagination';
import {
  getSceneStartBlockId,
  SCENE_START_BLOCK_TYPE,
} from './blocks/sceneStartBlock';

export type WorkspacePoint = {
  x: number;
  y: number;
};

export type SceneWorkspaceLayout = {
  rootPosition?: WorkspacePoint;
  scale: number;
  scrollX: number;
  scrollY: number;
};

export type BlockEditorLayoutStore = Map<
  string,
  SceneWorkspaceLayout
>;

type CaptureLayoutOptions = {
  updateRootPosition?: boolean;
  preferredRoot?: Blockly.BlockSvg;
};

function findCompleteFirstPageRoot(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
): Blockly.BlockSvg | null {
  const startBlock = workspace.getBlockById?.(
    getSceneStartBlockId(scene.id),
  );
  if (startBlock?.type === SCENE_START_BLOCK_TYPE) {
    return startBlock.getRootBlock() as Blockly.BlockSvg;
  }

  if (scene.nodes.length === 0) {
    return null;
  }

  const firstPage = paginateStoryNodes(scene.nodes)[0];
  if (!firstPage) {
    return null;
  }
  const firstPageNodeIds = new Set([
    ...firstPage.nodes.map((node) => node.id),
    ...(firstPage.continuation
      ? [firstPage.continuation.node.id]
      : []),
  ]);
  const firstPageRootId =
    firstPage.continuation?.node.id ?? firstPage.nodes[0]?.id;

  for (const root of workspace.getTopBlocks(false)) {
    if (!isStoryBlockType(root.type)) {
      continue;
    }

    if (root.id !== firstPageRootId) {
      continue;
    }

    const projectedNodeIds = new Set(
      root
        .getDescendants(false)
        .filter((block) => firstPageNodeIds.has(block.id))
        .map((block) => block.id),
    );

    // 第一段是整个派生布局的锚点。只有手动分段中的积木完整时
    // 才更新根坐标，拖动中的临时断链不能把所有自动列一起带走。
    if (projectedNodeIds.size === firstPageNodeIds.size) {
      return root;
    }
  }

  return null;
}

export function captureSceneWorkspaceLayout(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
  previousLayout?: SceneWorkspaceLayout,
  {
    updateRootPosition = true,
    preferredRoot,
  }: CaptureLayoutOptions = {},
): SceneWorkspaceLayout {
  let rootPosition = previousLayout?.rootPosition;

  if (updateRootPosition) {
    const root =
      findCompleteFirstPageRoot(scene, workspace) ??
      (scene.nodes.length === 0
        ? preferredRoot?.getRootBlock()
        : undefined);

    if (root) {
      const position = root.getRelativeToSurfaceXY();
      rootPosition = { x: position.x, y: position.y };
    }
  }

  return {
    rootPosition,
    scale: workspace.getScale(),
    scrollX: workspace.scrollX,
    scrollY: workspace.scrollY,
  };
}

export function restoreSceneWorkspaceViewport(
  workspace: Blockly.WorkspaceSvg,
  layout?: SceneWorkspaceLayout,
): void {
  if (!layout) {
    return;
  }

  if (workspace.getScale() !== layout.scale) {
    workspace.setScale(layout.scale);
  }

  // scroll 会根据最新内容边界安全地夹紧目标位置。
  workspace.scroll(layout.scrollX, layout.scrollY);
}
