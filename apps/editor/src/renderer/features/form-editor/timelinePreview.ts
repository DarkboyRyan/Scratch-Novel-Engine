import type { RuntimeCharacterState } from '@vnengine/runtime';

import type { SceneDocument } from '../../../shared/projectTypes';

// Kept as an Editor-facing alias while both timeline preview and game runtime
// share the platform-independent character state definition.
export type TimelineCharacterState = RuntimeCharacterState;

export type TimelinePreviewState = {
  backgroundAssetId: string | null;
  characters: TimelineCharacterState[];
  showDialogue: boolean;
};

// 背景节点是时间线事件。预览播放头以前最后出现的背景节点生效；
// 若还未遇到背景节点，则回退到 Scene 的初始背景。
export function deriveTimelinePreview(
  scene: SceneDocument,
  selectedNodeId: string | null,
): TimelinePreviewState {
  const selectedIndex = selectedNodeId
    ? scene.nodes.findIndex((node) => node.id === selectedNodeId)
    : -1;
  const playheadIndex =
    selectedIndex >= 0 ? selectedIndex : scene.nodes.length - 1;

  let backgroundAssetId = scene.backgroundAssetId;
  const charactersByLayer = new Map<number, TimelineCharacterState>();
  for (let index = 0; index <= playheadIndex; index += 1) {
    const node = scene.nodes[index];
    if (node?.type === 'background') {
      backgroundAssetId = node.assetId;
    } else if (node?.type === 'character') {
      if (node.assetId === null) {
        charactersByLayer.delete(node.layer);
      } else {
        charactersByLayer.set(node.layer, {
          nodeId: node.id,
          assetId: node.assetId,
          slot: node.slot,
          layer: node.layer,
        });
      }
    }
  }

  return {
    backgroundAssetId,
    characters: [...charactersByLayer.values()].sort(
      (left, right) => left.layer - right.layer,
    ),
    showDialogue:
      selectedIndex < 0 ||
      scene.nodes[selectedIndex]?.type === 'dialogue',
  };
}
