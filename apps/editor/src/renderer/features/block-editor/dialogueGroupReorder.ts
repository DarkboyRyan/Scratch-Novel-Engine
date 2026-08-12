import type { ReorderDialoguesParams } from '../../../shared/engineProtocol';
import type { SceneDocument } from '../../../shared/projectTypes';

export type DialogueDropTarget = {
  nodeId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type DialogueDropSlot = {
  beforeNodeId: string | null;
};

export const DIALOGUE_GROUP_SNAP_RADIUS_PX = 18;

function distanceToHorizontalSegment(
  clientX: number,
  clientY: number,
  left: number,
  right: number,
  y: number,
): number {
  const horizontalDistance =
    clientX < left
      ? left - clientX
      : clientX > right
        ? clientX - right
        : 0;

  return Math.hypot(horizontalDistance, clientY - y);
}

export function getDialogueDropSlotForPoint(
  targets: DialogueDropTarget[],
  clientX: number,
  clientY: number,
  snapRadius = DIALOGUE_GROUP_SNAP_RADIUS_PX,
): DialogueDropSlot | null {
  if (targets.length === 0) {
    return null;
  }

  const slots: Array<{
    beforeNodeId: string | null;
    distance: number;
  }> = targets.map((target) => ({
    beforeNodeId: target.nodeId,
    distance: distanceToHorizontalSegment(
      clientX,
      clientY,
      target.left,
      target.right,
      target.top,
    ),
  }));
  const finalTarget = targets[targets.length - 1];

  slots.push({
    beforeNodeId: null,
    distance: distanceToHorizontalSegment(
      clientX,
      clientY,
      finalTarget.left,
      finalTarget.right,
      finalTarget.bottom,
    ),
  });

  const closestSlot = slots.reduce((closest, slot) =>
    slot.distance < closest.distance ? slot : closest,
  );

  return closestSlot.distance <= snapRadius
    ? { beforeNodeId: closestSlot.beforeNodeId }
    : null;
}

export function reorderNodeIds(
  nodeIds: string[],
  selectedNodeIds: string[],
  beforeNodeId: string | null,
): string[] {
  const selected = new Set(selectedNodeIds);
  const moving = nodeIds.filter((nodeId) => selected.has(nodeId));
  const remaining = nodeIds.filter((nodeId) => !selected.has(nodeId));
  const insertionIndex =
    beforeNodeId === null
      ? remaining.length
      : remaining.indexOf(beforeNodeId);

  if (insertionIndex < 0) {
    return nodeIds;
  }

  return [
    ...remaining.slice(0, insertionIndex),
    ...moving,
    ...remaining.slice(insertionIndex),
  ];
}

export function buildGroupReorderParams(
  scene: SceneDocument,
  selectedNodeIds: string[],
  beforeNodeId: string | null,
): ReorderDialoguesParams | null {
  const sceneNodeIds = scene.nodes.map((node) => node.id);
  const requestedIds = new Set(selectedNodeIds);
  const orderedSelection = sceneNodeIds.filter((nodeId) =>
    requestedIds.has(nodeId),
  );

  if (
    orderedSelection.length < 2 ||
    orderedSelection.length !== requestedIds.size ||
    (beforeNodeId !== null &&
      (!sceneNodeIds.includes(beforeNodeId) ||
        requestedIds.has(beforeNodeId)))
  ) {
    return null;
  }

  const reordered = reorderNodeIds(
    sceneNodeIds,
    orderedSelection,
    beforeNodeId,
  );
  const changed = reordered.some(
    (nodeId, index) => nodeId !== sceneNodeIds[index],
  );

  return changed
    ? {
        sceneId: scene.id,
        nodeIds: orderedSelection,
        beforeNodeId,
      }
    : null;
}
