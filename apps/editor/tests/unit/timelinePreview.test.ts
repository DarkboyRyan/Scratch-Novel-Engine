/**
 * 文件主要作用：验证 deriveTimelinePreview 的行为。
 * 测试覆盖：`deriveTimelinePreview`。
 */

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
      mode: 'show',
      assetId: 'alice',
      slot: 'left',
      layer: 2,
      position: null,
      effect: null,
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

  it('keeps one portrait per layer and lets an explicit clear event remove it', () => {
    const portraitScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'alice',
          type: 'character',
          mode: 'show',
          assetId: 'alice-image',
          slot: 'left',
          layer: 1,
          position: null,
          effect: null,
        },
        {
          id: 'bob',
          type: 'character',
          mode: 'show',
          assetId: 'bob-image',
          slot: 'right',
          layer: 3,
          position: { x: 75, y: 90 },
          effect: null,
        },
        {
          id: 'replace',
          type: 'character',
          mode: 'show',
          assetId: 'carol-image',
          slot: 'center',
          layer: 1,
          position: null,
          effect: null,
        },
        {
          id: 'clear',
          type: 'character',
          mode: 'clear',
          assetId: null,
          slot: 'right',
          layer: 3,
          position: null,
          effect: null,
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
        opacity: 1,
        effect: null,
        effectSequence: 0,
      },
      {
        nodeId: 'bob',
        assetId: 'bob-image',
        slot: 'right',
        layer: 3,
        position: { x: 75, y: 90 },
        opacity: 1,
        effect: null,
        effectSequence: 0,
      },
    ]);
    expect(deriveTimelinePreview(portraitScene, 'clear').characters).toEqual([
      {
        nodeId: 'replace',
        assetId: 'carol-image',
        slot: 'center',
        layer: 1,
        position: null,
        opacity: 1,
        effect: null,
        effectSequence: 0,
      },
    ]);
  });

  it('treats an unresolved show portrait as a preview no-op', () => {
    const placeholderScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'visible',
          type: 'character',
          mode: 'show',
          assetId: 'alice-image',
          slot: 'left',
          layer: 2,
          position: null,
          effect: null,
        },
        {
          id: 'placeholder',
          type: 'character',
          mode: 'show',
          assetId: null,
          slot: 'right',
          layer: 2,
          position: null,
          effect: null,
        },
      ],
    };

    expect(
      deriveTimelinePreview(placeholderScene, 'placeholder').characters,
    ).toEqual([
      {
        nodeId: 'visible',
        assetId: 'alice-image',
        slot: 'left',
        layer: 2,
        position: null,
        opacity: 1,
        effect: null,
        effectSequence: 0,
      },
    ]);
  });

  it('uses an effect final opacity without animating the form preview', () => {
    const effectScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'fade-out',
          type: 'character',
          mode: 'show',
          assetId: 'alice-image',
          slot: 'center',
          layer: 1,
          position: null,
          effect: { type: 'fadeOut', durationMs: 500 },
        },
      ],
    };

    expect(deriveTimelinePreview(effectScene, 'fade-out').characters).toEqual([
      {
        nodeId: 'fade-out',
        assetId: 'alice-image',
        slot: 'center',
        layer: 1,
        position: null,
        opacity: 0,
        effect: null,
        effectSequence: 0,
      },
    ]);
  });

  it('previews the end when no node is selected and hides dialogue on an event', () => {
    expect(deriveTimelinePreview(scene, null).backgroundAssetId).toBe('room');
    expect(deriveTimelinePreview(scene, 'b1').showDialogue).toBe(false);
  });

  it('freezes before uncertain logic instead of combining Then and Else visuals', () => {
    const logicScene: SceneDocument = {
      ...scene,
      nodes: [
        { id: 'before', type: 'background', assetId: 'safe-background' },
        {
          id: 'if-1',
          type: 'logicIf',
          condition: {
            left: { kind: 'variable', name: 'route' },
            operator: 'eq',
            right: { kind: 'literal', value: 'A' },
          },
        },
        { id: 'then-bg', type: 'background', assetId: 'then-background' },
        { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
        { id: 'else-bg', type: 'background', assetId: 'else-background' },
        { id: 'end-1', type: 'logicEndIf', ifNodeId: 'if-1' },
        {
          id: 'after',
          type: 'dialogue',
          speaker: 'A',
          text: 'After',
          voiceAssetId: null,
        },
      ],
    };

    expect(deriveTimelinePreview(logicScene, 'else-bg')).toEqual({
      backgroundAssetId: 'safe-background',
      characters: [],
      showDialogue: false,
      logicPreviewUncertain: true,
    });
    expect(deriveTimelinePreview(logicScene, 'after')).toEqual({
      backgroundAssetId: 'safe-background',
      characters: [],
      showDialogue: false,
      logicPreviewUncertain: true,
    });
  });

  it('freezes before a CG segment and requests formal preview for timing', () => {
    const cgScene: SceneDocument = {
      ...scene,
      nodes: [
        { id: 'before', type: 'background', assetId: 'safe-background' },
        {
          id: 'cg-1',
          type: 'cgDisplay',
          assetId: 'cg-image',
          leadInMs: 1250,
        },
        {
          id: 'cg-line',
          type: 'dialogue',
          speaker: 'A',
          text: 'Inside CG',
          voiceAssetId: null,
        },
        {
          id: 'cg-end',
          type: 'cgEndDisplay',
          cgDisplayNodeId: 'cg-1',
        },
        { id: 'after-bg', type: 'background', assetId: 'after-background' },
      ],
    };

    expect(deriveTimelinePreview(cgScene, 'cg-line')).toEqual({
      backgroundAssetId: 'safe-background',
      characters: [],
      showDialogue: false,
      cgPreviewUncertain: true,
    });
    expect(deriveTimelinePreview(cgScene, 'after-bg')).toEqual({
      backgroundAssetId: 'safe-background',
      characters: [],
      showDialogue: false,
      cgPreviewUncertain: true,
    });
  });
});
