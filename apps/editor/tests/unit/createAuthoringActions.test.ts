import { describe, expect, it, vi } from 'vitest';

import { createAuthoringActions } from '../../src/renderer/application/createAuthoringActions';
import type {
  EngineMutationResult,
  VnEngineApi,
} from '../../src/shared/engineProtocol';

const result = {
  project: {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Story',
    entrySceneId: 'scene-1',
    startScreen: {
      title: 'Story',
      backgroundAssetId: null,
      musicAssetId: null,
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
    },
    scenes: [],
  },
  assets: [],
  session: {
    revision: 1,
    savedRevision: null,
    isDirty: true,
  },
} satisfies EngineMutationResult;

describe('createAuthoringActions', () => {
  it('maps feature parameters through the injected command and runner ports', async () => {
    const addDialogue = vi.fn().mockResolvedValue(result);
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: { addDialogue } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
    });

    await expect(
      actions.addDialogue({
        sceneId: 'scene-1',
        speaker: 'Alice',
        text: 'Hello',
      }),
    ).resolves.toBe(true);
    expect(addDialogue).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      speaker: 'Alice',
      text: 'Hello',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy scene-jump availability guard outside features', async () => {
    const onSceneJumpUnavailable = vi.fn();
    const run = vi.fn();
    const actions = createAuthoringActions({
      commands: {} as VnEngineApi,
      run,
      onSceneJumpUnavailable,
      onStoryExtensionUnavailable: vi.fn(),
    });

    await expect(
      actions.addSceneJump({
        sceneId: 'scene-1',
        targetSceneId: 'scene-2',
      }),
    ).resolves.toBe(false);
    expect(onSceneJumpUnavailable).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it('maps story extension placement through the authoring command port', async () => {
    const addStoryExtension = vi.fn().mockResolvedValue(result);
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: { addStoryExtension } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
    });

    await expect(actions.addStoryExtension({
      sceneId: 'scene-1',
      beforeNodeId: 'dialogue-2',
    })).resolves.toBe(true);
    expect(addStoryExtension).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      beforeNodeId: 'dialogue-2',
    });
  });

  it('reports a stale preload before attempting story extension insertion', async () => {
    const run = vi.fn();
    const onStoryExtensionUnavailable = vi.fn();
    const actions = createAuthoringActions({
      commands: {} as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable,
    });

    await expect(actions.addStoryExtension({
      sceneId: 'scene-1',
      beforeNodeId: null,
    })).resolves.toBe(false);
    expect(onStoryExtensionUnavailable).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it('reports a stale preload before attempting extension page reordering', async () => {
    const run = vi.fn();
    const onStoryExtensionUnavailable = vi.fn();
    const actions = createAuthoringActions({
      commands: {} as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable,
    });

    await expect(actions.reorderTimelineNodes({
      sceneId: 'scene-1',
      nodeIds: ['extension-1', 'dialogue-2'],
      beforeNodeId: null,
    })).resolves.toBe(false);
    expect(onStoryExtensionUnavailable).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });
});
