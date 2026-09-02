/**
 * 文件主要作用：验证 createAuthoringActions 的行为。
 * 测试覆盖：`createAuthoringActions`。
 */

import { describe, expect, it, vi } from 'vitest';

import { createAuthoringActions } from '../../src/renderer/application/createAuthoringActions';
import type {
  EngineMutationResult,
  VnEngineApi,
} from '../../src/shared/engineProtocol';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
} from '../../src/shared/projectTypes';

const result = {
  project: {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Story',
    entrySceneId: 'scene-1',
    startScreen: {
      title: 'Story',
      eyebrow: 'A VN ENGINE STORY',
      backgroundAssetId: null,
      musicAssetId: null,
      style: { ...DEFAULT_START_SCREEN_STYLE },
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      style: { ...DEFAULT_CG_GALLERY_STYLE },
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
      onLogicModuleUnavailable: vi.fn(),
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
      onLogicModuleUnavailable: vi.fn(),
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
      onLogicModuleUnavailable: vi.fn(),
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
      onLogicModuleUnavailable: vi.fn(),
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
      onLogicModuleUnavailable: vi.fn(),
    });

    await expect(actions.reorderTimelineNodes({
      sceneId: 'scene-1',
      nodeIds: ['extension-1', 'dialogue-2'],
      beforeNodeId: null,
    })).resolves.toBe(false);
    expect(onStoryExtensionUnavailable).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it('maps atomic logic-control commands through the authoring port', async () => {
    const addLogicIf = vi.fn().mockResolvedValue(result);
    const deleteLogicControl = vi.fn().mockResolvedValue(result);
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: {
        addLogicIf,
        deleteLogicControl,
      } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
    });
    const condition = {
      left: { kind: 'variable' as const, name: 'score' },
      operator: 'gte' as const,
      right: { kind: 'literal' as const, value: 5 },
    };

    await expect(actions.addLogicIf({
      sceneId: 'scene-1',
      beforeNodeId: 'dialogue-2',
      condition,
    })).resolves.toBe(true);
    await expect(actions.deleteLogicControl({
      sceneId: 'scene-1',
      nodeId: 'if-1',
    })).resolves.toBe(true);
    expect(addLogicIf).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      beforeNodeId: 'dialogue-2',
      condition,
    });
    expect(deleteLogicControl).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'if-1',
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('guards stale preload methods across logic add, update, and reorder actions', async () => {
    const run = vi.fn();
    const onLogicModuleUnavailable = vi.fn();
    const actions = createAuthoringActions({
      commands: {} as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable,
    });

    await expect(actions.addVariableSet({
      sceneId: 'scene-1',
      beforeNodeId: null,
      variableName: 'route',
      value: 'A',
    })).resolves.toBe(false);
    await expect(actions.updateLogicIf({
      sceneId: 'scene-1',
      nodeId: 'if-1',
      condition: {
        left: { kind: 'variable', name: 'route' },
        operator: 'eq',
        right: { kind: 'literal', value: 'A' },
      },
    })).resolves.toBe(false);
    await expect(actions.reorderLogicControl({
      sceneId: 'scene-1',
      nodeId: 'if-1',
      beforeNodeId: null,
    })).resolves.toBe(false);

    expect(onLogicModuleUnavailable).toHaveBeenCalledTimes(3);
    expect(run).not.toHaveBeenCalled();
  });

  it('does not relabel ordinary logic backend errors as a stale module', async () => {
    const backendError = new Error(
      'project cannot contain more than 32 logic variables',
    );
    backendError.name = 'VnEngineError:logic_variable_limit';
    const addLogicIf = vi.fn().mockRejectedValue(backendError);
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: { addLogicIf } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
    });

    await expect(actions.addLogicIf({
      sceneId: 'scene-1',
      beforeNodeId: null,
      condition: {
        left: { kind: 'variable', name: 'route' },
        operator: 'eq',
        right: { kind: 'literal', value: 'A' },
      },
    })).rejects.toBe(backendError);
  });

  it('tags only stale Main or backend signals for logic restart guidance', async () => {
    const reorderLogicControl = vi.fn().mockRejectedValue(
      new Error('No handler registered for vn-engine:request'),
    );
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: { reorderLogicControl } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
    });

    await expect(actions.reorderLogicControl({
      sceneId: 'scene-1',
      nodeId: 'if-1',
      beforeNodeId: null,
    })).rejects.toThrow('[logic-module]');
  });

  it('guards all four CG-display commands when preload is stale', async () => {
    const run = vi.fn();
    const onCgDisplayModuleUnavailable = vi.fn();
    const actions = createAuthoringActions({
      commands: {} as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
      onCgDisplayModuleUnavailable,
    });

    await expect(actions.addCgDisplay({
      sceneId: 'scene-1',
      assetId: 'cg-1',
      leadInMs: 1250,
      afterNodeId: null,
      beforeNodeId: null,
    })).resolves.toBe(false);
    await expect(actions.updateCgDisplay({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
      assetId: 'cg-1',
      leadInMs: 1250,
    })).resolves.toBe(false);
    await expect(actions.deleteCgDisplay({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
    })).resolves.toBe(false);
    await expect(actions.reorderCgDisplay({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
      beforeNodeId: null,
    })).resolves.toBe(false);

    expect(onCgDisplayModuleUnavailable).toHaveBeenCalledTimes(4);
    expect(run).not.toHaveBeenCalled();
  });

  it('tags stale CG-display methods but preserves ordinary business errors', async () => {
    const stale = vi.fn().mockRejectedValue(
      new Error('unknown method: cgDisplay.reorder'),
    );
    const businessError = new Error('asset_not_image');
    const update = vi.fn().mockRejectedValue(businessError);
    const oldMain = vi.fn().mockRejectedValue(
      new Error('invalid engine invocation'),
    );
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: {
        reorderCgDisplay: stale,
        updateCgDisplay: update,
        addCgDisplay: oldMain,
      } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
      onCgDisplayModuleUnavailable: vi.fn(),
    });

    await expect(actions.reorderCgDisplay({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
      beforeNodeId: null,
    })).rejects.toThrow('[cg-display-module]');
    await expect(actions.addCgDisplay({
      sceneId: 'scene-1',
      assetId: 'cg-image',
      leadInMs: 0,
    })).rejects.toThrow('[cg-display-module]');
    await expect(actions.updateCgDisplay({
      sceneId: 'scene-1',
      nodeId: 'cg-display-1',
      assetId: 'not-an-image',
      leadInMs: 0,
    })).rejects.toBe(businessError);
  });

  it('maps portrait-effect commands and guards stale preload methods', async () => {
    const updateCharacterEffect = vi.fn().mockResolvedValue(result);
    const moveCharacterEffect = vi.fn().mockResolvedValue(result);
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: {
        updateCharacterEffect,
        moveCharacterEffect,
      } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
      onCharacterEffectModuleUnavailable: vi.fn(),
    });
    const effect = {
      type: 'slideIn' as const,
      durationMs: 500,
      intensity: 'normal' as const,
      direction: 'right' as const,
    };

    await expect(actions.updateCharacterEffect({
      sceneId: 'scene-1',
      nodeId: 'character-1',
      effect,
    })).resolves.toBe(true);
    await expect(actions.moveCharacterEffect({
      sceneId: 'scene-1',
      fromNodeId: 'character-1',
      toNodeId: 'character-2',
      effect,
    })).resolves.toBe(true);
    expect(updateCharacterEffect).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'character-1',
      effect,
    });
    expect(moveCharacterEffect).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      fromNodeId: 'character-1',
      toNodeId: 'character-2',
      effect,
    });

    const unavailable = vi.fn();
    const staleActions = createAuthoringActions({
      commands: {} as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
      onCharacterEffectModuleUnavailable: unavailable,
    });
    await expect(staleActions.updateCharacterEffect({
      sceneId: 'scene-1',
      nodeId: 'character-1',
      effect: null,
    })).resolves.toBe(false);
    await expect(staleActions.moveCharacterEffect({
      sceneId: 'scene-1',
      fromNodeId: 'character-1',
      toNodeId: 'character-2',
      effect,
    })).resolves.toBe(false);
    expect(unavailable).toHaveBeenCalledTimes(2);
  });

  it('tags stale character-mode protocols without hiding business errors', async () => {
    const addCharacter = vi.fn().mockRejectedValue(
      new Error('invalid engine invocation'),
    );
    const businessError = new Error('asset_not_image');
    const updateCharacter = vi.fn()
      .mockRejectedValueOnce(new Error('unknown params: mode'))
      .mockRejectedValueOnce(businessError);
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: {
        addCharacter,
        updateCharacter,
      } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
    });

    await expect(actions.addCharacter({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
    })).rejects.toThrow('[character-mode-module]');
    const update = {
      sceneId: 'scene-1',
      nodeId: 'character-1',
      mode: 'show' as const,
      assetId: 'portrait-1',
      slot: 'center' as const,
      layer: 1,
      position: null,
      scalePercent: 100,
    };
    await expect(actions.updateCharacter(update))
      .rejects.toThrow('[character-mode-module]');
    await expect(actions.updateCharacter(update)).rejects.toBe(businessError);
  });

  it('tags stale portrait-effect methods but preserves business errors', async () => {
    const stale = vi.fn().mockRejectedValue(
      new Error('unknown method: characterEffect.move'),
    );
    const businessError = new Error('source_effect_mismatch');
    const update = vi.fn().mockRejectedValue(businessError);
    const run = vi.fn(
      (action: () => Promise<EngineMutationResult>) => action(),
    );
    const actions = createAuthoringActions({
      commands: {
        moveCharacterEffect: stale,
        updateCharacterEffect: update,
      } as unknown as VnEngineApi,
      run,
      onSceneJumpUnavailable: vi.fn(),
      onStoryExtensionUnavailable: vi.fn(),
      onLogicModuleUnavailable: vi.fn(),
      onCharacterEffectModuleUnavailable: vi.fn(),
    });
    const effect = {
      type: 'shake' as const,
      durationMs: 500,
      intensity: 'normal' as const,
    };

    await expect(actions.moveCharacterEffect({
      sceneId: 'scene-1',
      fromNodeId: 'character-1',
      toNodeId: 'character-2',
      effect,
    })).rejects.toThrow('[character-effect-module]');
    await expect(actions.updateCharacterEffect({
      sceneId: 'scene-1',
      nodeId: 'character-1',
      effect,
    })).rejects.toBe(businessError);
  });
});
