/**
 * 文件主要作用：从选中时间线位置推导背景、角色和媒体预览状态。
 * 包含实现：`TimelineCharacterState`、`TimelinePreviewState`、`deriveTimelinePreview`。
 */

import type { RuntimeCharacterState } from '@vnengine/runtime';

import {
  semanticSceneNodes,
  type SceneDocument,
} from '../../../shared/projectTypes';

// Kept as an Editor-facing alias while both timeline preview and game runtime
// share the platform-independent character state definition.
export type TimelineCharacterState = RuntimeCharacterState;

export type TimelinePreviewState = {
  backgroundAssetId: string | null;
  backgroundScalePercent: number;
  cgAssetId: string | null;
  characters: TimelineCharacterState[];
  showDialogue: boolean;
  logicPreviewUncertain?: true;
  cgPreviewUncertain?: true;
};

// 背景节点是时间线事件。预览播放头以前最后出现的背景节点生效；
// 若还未遇到背景节点，则回退到 Scene 的初始背景。
export function deriveTimelinePreview(
  scene: SceneDocument,
  selectedNodeId: string | null,
): TimelinePreviewState {
  // Use the executable scene order here rather than the form-only projection.
  // In particular, CG end markers are invisible in the timeline list but are
  // still required to clear the static CG at the correct position.
  const nodes = semanticSceneNodes(scene);
  const selectedIndex = selectedNodeId
    ? nodes.findIndex((node) => node.id === selectedNodeId)
    : -1;
  const firstControlIndex = nodes.findIndex(
    (node) => node.type === 'logicIf' || node.type === 'logicRepeat',
  );
  const requestedPlayheadIndex =
    selectedIndex >= 0 ? selectedIndex : nodes.length - 1;
  // Form preview has no author-time variable state. Once execution reaches a
  // branch/loop, applying both flattened bodies would silently display a state
  // that can never occur. Freeze at the last definitely executed node instead;
  // formal preview evaluates the actual runtime variables.
  const previewIsUncertain =
    firstControlIndex >= 0 && requestedPlayheadIndex >= firstControlIndex;
  const playheadIndex = previewIsUncertain
    ? firstControlIndex - 1
    : requestedPlayheadIndex;

  let backgroundAssetId = scene.backgroundAssetId;
  // Start from the scene-level initial background scale. Each later
  // BackgroundNode replaces both the active image and its scale atomically.
  let backgroundScalePercent = scene.backgroundScalePercent;
  let cgAssetId: string | null = null;
  let cgDisplayNodeId: string | null = null;
  const charactersByLayer = new Map<number, TimelineCharacterState>();
  for (let index = 0; index <= playheadIndex; index += 1) {
    const node = nodes[index];
    if (node?.type === 'background') {
      backgroundAssetId = node.assetId;
      backgroundScalePercent = node.scalePercent;
    } else if (node?.type === 'character') {
      if (node.mode === 'clear') {
        charactersByLayer.delete(node.layer);
      } else if (node.assetId !== null) {
        charactersByLayer.set(node.layer, {
          nodeId: node.id,
          assetId: node.assetId,
          slot: node.slot,
          layer: node.layer,
          position: node.position,
          scalePercent: node.scalePercent,
          opacity: node.effect?.type === 'fadeOut' ? 0 : 1,
          effect: null,
          effectSequence: 0,
        });
      }
    } else if (node?.type === 'cgDisplay') {
      cgAssetId = node.assetId;
      cgDisplayNodeId = node.id;
    } else if (
      node?.type === 'cgEndDisplay' &&
      node.cgDisplayNodeId === cgDisplayNodeId
    ) {
      cgAssetId = null;
      cgDisplayNodeId = null;
    }
  }

  return {
    backgroundAssetId,
    backgroundScalePercent,
    cgAssetId,
    characters: [...charactersByLayer.values()].sort(
      (left, right) => left.layer - right.layer,
    ),
    showDialogue:
      !previewIsUncertain &&
      (selectedIndex < 0 || nodes[selectedIndex]?.type === 'dialogue'),
    ...(previewIsUncertain
      ? { logicPreviewUncertain: true as const }
      : {}),
    ...(!previewIsUncertain && cgAssetId !== null
      ? { cgPreviewUncertain: true as const }
      : {}),
  };
}
