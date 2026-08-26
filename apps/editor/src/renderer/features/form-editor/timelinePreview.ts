import type { RuntimeCharacterState } from '@vnengine/runtime';

import {
  formVisibleSceneNodes,
  type SceneDocument,
} from '../../../shared/projectTypes';

// Kept as an Editor-facing alias while both timeline preview and game runtime
// share the platform-independent character state definition.
export type TimelineCharacterState = RuntimeCharacterState;

export type TimelinePreviewState = {
  backgroundAssetId: string | null;
  characters: TimelineCharacterState[];
  showDialogue: boolean;
  logicPreviewUncertain?: true;
};

// 背景节点是时间线事件。预览播放头以前最后出现的背景节点生效；
// 若还未遇到背景节点，则回退到 Scene 的初始背景。
export function deriveTimelinePreview(
  scene: SceneDocument,
  selectedNodeId: string | null,
): TimelinePreviewState {
  const nodes = formVisibleSceneNodes(scene);
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
  const charactersByLayer = new Map<number, TimelineCharacterState>();
  for (let index = 0; index <= playheadIndex; index += 1) {
    const node = nodes[index];
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
          position: node.position,
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
      !previewIsUncertain &&
      (selectedIndex < 0 || nodes[selectedIndex]?.type === 'dialogue'),
    ...(previewIsUncertain
      ? { logicPreviewUncertain: true as const }
      : {}),
  };
}
