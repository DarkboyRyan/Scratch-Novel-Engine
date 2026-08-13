import { describe, expect, it } from 'vitest';

import {
  buildGroupReorderParams,
  getTimelineDropSlotForPoint,
  reorderNodeIds,
} from '../../src/renderer/features/block-editor/dialogueGroupReorder';
import type { SceneDocument } from '../../src/shared/projectTypes';

function createScene(nodeIds: string[]): SceneDocument {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Scene 1',
    backgroundAssetId: null,
    nodes: nodeIds.map((id) => ({
      id,
      type: 'dialogue',
      speaker: id,
      text: `Text ${id}`,
    })),
  };
}

describe('dialogue group reorder', () => {
  it('only chooses a slot when the pointer is actually close to it', () => {
    const targets = [
      {
        nodeId: 'A',
        left: 100,
        right: 220,
        top: 10,
        bottom: 30,
      },
      {
        nodeId: 'C',
        left: 100,
        right: 220,
        top: 40,
        bottom: 60,
      },
    ];

    expect(getTimelineDropSlotForPoint(targets, 150, 11, 12)).toEqual({
      beforeNodeId: 'A',
    });
    expect(getTimelineDropSlotForPoint(targets, 150, 58, 12)).toEqual({
      beforeNodeId: null,
    });
    expect(getTimelineDropSlotForPoint(targets, 150, 25, 12)).toBeNull();
    expect(getTimelineDropSlotForPoint(targets, 80, 10, 12)).toBeNull();
  });

  it('preserves scene order even when selection arrives reversed', () => {
    const scene = createScene(['A', 'B', 'C', 'D', 'E']);

    expect(
      buildGroupReorderParams(scene, ['D', 'B'], 'E'),
    ).toEqual({
      sceneId: 'scene-1',
      nodeIds: ['B', 'D'],
      beforeNodeId: 'E',
    });
    expect(
      reorderNodeIds(
        scene.nodes.map((node) => node.id),
        ['D', 'B'],
        'E',
      ),
    ).toEqual(['A', 'C', 'B', 'D', 'E']);
  });

  it('uses null to move the selected group to the end', () => {
    const scene = createScene(['A', 'B', 'C', 'D', 'E']);

    expect(
      buildGroupReorderParams(scene, ['B', 'D'], null),
    ).toEqual({
      sceneId: 'scene-1',
      nodeIds: ['B', 'D'],
      beforeNodeId: null,
    });
  });

  it('does not send a request for a no-op drop', () => {
    const scene = createScene(['A', 'B', 'C', 'D', 'E']);

    expect(
      buildGroupReorderParams(scene, ['B', 'C'], 'D'),
    ).toBeNull();
  });

  it('rejects incomplete selections and selected anchors', () => {
    const scene = createScene(['A', 'B', 'C', 'D']);

    expect(
      buildGroupReorderParams(scene, ['B', 'missing'], 'D'),
    ).toBeNull();
    expect(
      buildGroupReorderParams(scene, ['B', 'C'], 'C'),
    ).toBeNull();
    expect(
      buildGroupReorderParams(scene, ['B', 'C'], 'missing'),
    ).toBeNull();
    expect(
      buildGroupReorderParams(scene, ['B'], 'D'),
    ).toBeNull();
  });
});
