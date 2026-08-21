import { describe, expect, it } from 'vitest';

import { deriveTimelinePreview } from '../../src/renderer/features/form-editor/timelinePreview';
import type { SceneDocument } from '../../src/shared/projectTypes';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: '场景 1',
  backgroundAssetId: 'initial',
  nodes: [
    {
      id: 'd1',
      type: 'dialogue',
      speaker: 'A',
      text: 'one',
      voiceAssetId: null,
    },
    { id: 'b1', type: 'background', assetId: 'forest' },
    { id: 'extension-1', type: 'storyExtension' },
    {
      id: 'd2',
      type: 'dialogue',
      speaker: 'B',
      text: 'two',
      voiceAssetId: null,
    },
    {
      id: 'c1',
      type: 'character',
      assetId: 'alice',
      slot: 'left',
      layer: 2,
      position: null,
    },
    { id: 'b2', type: 'background', assetId: 'room' },
  ],
};

describe('deriveTimelinePreview', () => {
  it('uses the initial scene background before the first background node', () => {
    expect(deriveTimelinePreview(scene, 'd1')).toEqual({
      backgroundAssetId: 'initial',
      characters: [],
      showDialogue: true,
    });
  });

  it('keeps the latest background active until another background node', () => {
    expect(deriveTimelinePreview(scene, 'd2')).toEqual({
      backgroundAssetId: 'forest',
      characters: [],
      showDialogue: true,
    });
  });

  it('keeps authoring-only story extensions invisible to preview semantics', () => {
    expect(deriveTimelinePreview(scene, 'd2')).toEqual({
      backgroundAssetId: 'forest',
      characters: [],
      showDialogue: true,
    });
  });

  it('clears the active background at a no-background node', () => {
    const clearScene: SceneDocument = {
      ...scene,
      nodes: [
        ...scene.nodes.slice(0, 3),
        { id: 'clear', type: 'background', assetId: null },
        {
          id: 'd3',
          type: 'dialogue',
          speaker: 'C',
          text: 'three',
          voiceAssetId: null,
        },
      ],
    };

    expect(deriveTimelinePreview(clearScene, 'd3')).toEqual({
      backgroundAssetId: null,
      characters: [],
      showDialogue: true,
    });
  });

  it('keeps one portrait per layer and lets a null event clear it', () => {
    const portraitScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'alice',
          type: 'character',
          assetId: 'alice-image',
          slot: 'left',
          layer: 1,
          position: null,
        },
        {
          id: 'bob',
          type: 'character',
          assetId: 'bob-image',
          slot: 'right',
          layer: 3,
          position: { x: 75, y: 90 },
        },
        {
          id: 'replace',
          type: 'character',
          assetId: 'carol-image',
          slot: 'center',
          layer: 1,
          position: null,
        },
        {
          id: 'clear',
          type: 'character',
          assetId: null,
          slot: 'right',
          layer: 3,
          position: null,
        },
      ],
    };

    expect(deriveTimelinePreview(portraitScene, 'replace').characters).toEqual([
      {
        nodeId: 'replace',
        assetId: 'carol-image',
        slot: 'center',
        layer: 1,
        position: null,
      },
      {
        nodeId: 'bob',
        assetId: 'bob-image',
        slot: 'right',
        layer: 3,
        position: { x: 75, y: 90 },
      },
    ]);
    expect(deriveTimelinePreview(portraitScene, 'clear').characters).toEqual([
      {
        nodeId: 'replace',
        assetId: 'carol-image',
        slot: 'center',
        layer: 1,
        position: null,
      },
    ]);
  });

  it('previews the end when no node is selected and hides dialogue on an event', () => {
    expect(deriveTimelinePreview(scene, null).backgroundAssetId).toBe(
      'room',
    );
    expect(deriveTimelinePreview(scene, 'b1').showDialogue).toBe(false);
  });
});
