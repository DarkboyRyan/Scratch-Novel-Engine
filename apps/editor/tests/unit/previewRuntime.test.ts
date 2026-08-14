import { describe, expect, it } from 'vitest';

import {
  advanceGamePreview,
  startGamePreview,
} from '../../src/renderer/features/game-preview/previewRuntime';
import type { ProjectDocument } from '../../src/shared/projectTypes';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'project-1',
  name: 'Preview',
  entrySceneId: 'scene-entry',
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-other',
      name: 'Not entry',
      backgroundAssetId: null,
      nodes: [],
    },
    {
      schemaVersion: 1,
      id: 'scene-entry',
      name: 'Entry',
      backgroundAssetId: 'initial',
      nodes: [
        { id: 'background', type: 'background', assetId: 'room' },
        {
          id: 'alice',
          type: 'character',
          assetId: 'alice-image',
          slot: 'left',
          layer: 1,
        },
        { id: 'd1', type: 'dialogue', speaker: 'A', text: 'one' },
        {
          id: 'bob',
          type: 'character',
          assetId: 'bob-image',
          slot: 'right',
          layer: 2,
        },
        {
          id: 'replace',
          type: 'character',
          assetId: 'carol-image',
          slot: 'center',
          layer: 1,
        },
        { id: 'd2', type: 'dialogue', speaker: 'B', text: 'two' },
        {
          id: 'clear',
          type: 'character',
          assetId: null,
          slot: 'right',
          layer: 2,
        },
      ],
    },
  ],
};

describe('game preview runtime', () => {
  it('starts at the entry scene and auto-runs visual nodes to the first dialogue', () => {
    expect(startGamePreview(project)).toEqual({
      status: 'playing',
      sceneId: 'scene-entry',
      nextNodeIndex: 3,
      backgroundAssetId: 'room',
      characters: [
        {
          nodeId: 'alice',
          assetId: 'alice-image',
          slot: 'left',
          layer: 1,
        },
      ],
      dialogue: { id: 'd1', type: 'dialogue', speaker: 'A', text: 'one' },
    });
  });

  it('advances to one dialogue at a time while applying intermediate portraits', () => {
    const started = startGamePreview(project);
    if (!started) throw new Error('preview did not start');
    const next = advanceGamePreview(project, started);

    expect(next.dialogue?.id).toBe('d2');
    expect(next.characters).toEqual([
      {
        nodeId: 'replace',
        assetId: 'carol-image',
        slot: 'center',
        layer: 1,
      },
      {
        nodeId: 'bob',
        assetId: 'bob-image',
        slot: 'right',
        layer: 2,
      },
    ]);

    const finished = advanceGamePreview(project, next);
    expect(finished.status).toBe('finished');
    expect(finished.dialogue).toBeNull();
    expect(finished.characters).toEqual([
      {
        nodeId: 'replace',
        assetId: 'carol-image',
        slot: 'center',
        layer: 1,
      },
    ]);
  });

  it('finishes an empty entry scene without mutating the project', () => {
    const emptyProject: ProjectDocument = {
      ...project,
      entrySceneId: 'scene-other',
    };
    const before = structuredClone(emptyProject);
    expect(startGamePreview(emptyProject)?.status).toBe('finished');
    expect(emptyProject).toEqual(before);
  });

  it('refuses a project whose entry scene is missing', () => {
    expect(
      startGamePreview({ ...project, entrySceneId: 'missing' }),
    ).toBeNull();
  });

  it('changes scenes only when a scene jump node is executed', () => {
    const jumping: ProjectDocument = structuredClone(project);
    jumping.scenes[1].nodes.push({
      id: 'jump',
      type: 'sceneJump',
      targetSceneId: 'scene-other',
    });
    jumping.scenes[0].backgroundAssetId = 'target-bg';
    jumping.scenes[0].nodes = [
      { id: 'target-d', type: 'dialogue', speaker: 'C', text: 'arrived' },
    ];
    let runtime = startGamePreview(jumping);
    if (!runtime) throw new Error('preview did not start');
    runtime = advanceGamePreview(jumping, runtime);
    runtime = advanceGamePreview(jumping, runtime);
    expect(runtime.sceneId).toBe('scene-other');
    expect(runtime.dialogue?.id).toBe('target-d');
    expect(runtime.backgroundAssetId).toBe('target-bg');
    expect(runtime.characters).toEqual([]);
  });

  it('detects a scene jump cycle without a dialogue', () => {
    const cyclic: ProjectDocument = {
      schemaVersion: 1,
      id: 'cycle',
      name: 'Cycle',
      entrySceneId: 'a',
      scenes: [
        {
          schemaVersion: 1,
          id: 'a',
          name: 'A',
          backgroundAssetId: null,
          nodes: [{ id: 'ab', type: 'sceneJump', targetSceneId: 'b' }],
        },
        {
          schemaVersion: 1,
          id: 'b',
          name: 'B',
          backgroundAssetId: null,
          nodes: [{ id: 'ba', type: 'sceneJump', targetSceneId: 'a' }],
        },
      ],
    };
    expect(startGamePreview(cyclic)?.status).toBe('runtimeError');
  });
});
