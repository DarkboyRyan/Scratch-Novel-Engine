import type * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import { DIALOGUE_BLOCK_TYPE } from './blocks/dialogueBlock';

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

function findCompleteDialogueRoot(
  scene: SceneDocument,
  workspace: Blockly.WorkspaceSvg,
): Blockly.BlockSvg | null {
  if (scene.nodes.length === 0) {
    return null;
  }

  const sceneNodeIds = new Set(
    scene.nodes.map((node) => node.id),
  );

  for (const root of workspace.getTopBlocks(false)) {
    if (root.type !== DIALOGUE_BLOCK_TYPE) {
      continue;
    }

    const projectedNodeCount = root
      .getDescendants(false)
      .filter((block) => sceneNodeIds.has(block.id)).length;

    // 只有完整的一条 Scene 链才能取代已保存的根坐标。
    // 拖动中的孤立积木不能把整条剧情链的位置带走。
    if (projectedNodeCount === scene.nodes.length) {
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
      findCompleteDialogueRoot(scene, workspace) ??
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
