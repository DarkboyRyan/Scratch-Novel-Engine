/**
 * 文件主要作用：验证 character effect block events 的行为。
 * 测试覆盖：`character effect block events`。
 */

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  collectCharacterEffectFieldDrafts,
  getCharacterEffectMutation,
  getCharacterEffectOwnerForDelete,
} from '../../src/renderer/features/block-editor/characterEffectBlockEvents';
import {
  CHARACTER_BLOCK_INPUTS,
  CHARACTER_BLOCK_TYPE,
  registerCharacterBlock,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import {
  CHARACTER_EFFECT_BLOCK_TYPES,
  registerCharacterEffectBlocks,
  setCharacterEffectBlock,
  setCharacterEffectOwner,
} from '../../src/renderer/features/block-editor/blocks/characterEffectBlock';

const shake = {
  type: 'shake',
  durationMs: 500,
  intensity: 'normal',
} as const;

function sceneWithEffects(): SceneDocument {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Scene',
    backgroundAssetId: null,
    nodes: [
      {
        id: 'portrait-a',
        type: 'character',
        mode: 'show',
        assetId: 'alice',
        slot: 'left',
        layer: 1,
        position: null,
        effect: shake,
      },
      {
        id: 'portrait-b',
        type: 'character',
        mode: 'show',
        assetId: 'bob',
        slot: 'right',
        layer: 2,
        position: null,
        effect: null,
      },
      {
        id: 'clear',
        type: 'character',
        mode: 'clear',
        assetId: null,
        slot: 'center',
        layer: 3,
        position: null,
        effect: null,
      },
    ],
  };
}

function workspaceWithProjectedEffect() {
  registerCharacterEffectBlocks();
  registerCharacterBlock();
  const workspace = new Blockly.Workspace();
  const parentA = workspace.newBlock(CHARACTER_BLOCK_TYPE, 'portrait-a');
  const parentB = workspace.newBlock(CHARACTER_BLOCK_TYPE, 'portrait-b');
  const effect = workspace.newBlock(
    CHARACTER_EFFECT_BLOCK_TYPES.shake,
    'portrait-a:effect',
  );
  setCharacterEffectBlock(effect, shake);
  setCharacterEffectOwner(effect, 'portrait-a');
  parentA.getInput(CHARACTER_BLOCK_INPUTS.effect)?.connection?.connect(
    effect.outputConnection!,
  );
  return { workspace, parentA, parentB, effect };
}

function moveEvent(
  blockId: string,
  oldParentId?: string,
  newParentId?: string,
): Blockly.Events.Abstract {
  return {
    type: Blockly.Events.BLOCK_MOVE,
    blockId,
    oldParentId,
    oldInputName: oldParentId ? CHARACTER_BLOCK_INPUTS.effect : undefined,
    newParentId,
    newInputName: newParentId ? CHARACTER_BLOCK_INPUTS.effect : undefined,
  } as unknown as Blockly.Events.Abstract;
}

describe('character effect block events', () => {
  it('adds a toolbox effect to a portrait and rejects an orphan', () => {
    const scene = sceneWithEffects();
    const { workspace, parentB } = workspaceWithProjectedEffect();
    const fresh = workspace.newBlock(
      CHARACTER_EFFECT_BLOCK_TYPES.fadeIn,
      'toolbox-effect',
    );
    parentB.getInput(CHARACTER_BLOCK_INPUTS.effect)?.connection?.connect(
      fresh.outputConnection!,
    );

    expect(getCharacterEffectMutation(
      moveEvent(fresh.id, undefined, parentB.id),
      workspace as Blockly.WorkspaceSvg,
      scene,
    )).toEqual({
      kind: 'update',
      nodeId: 'portrait-b',
      effect: { type: 'fadeIn', durationMs: 500 },
    });

    fresh.unplug();
    expect(getCharacterEffectMutation(
      moveEvent(fresh.id),
      workspace as Blockly.WorkspaceSvg,
      scene,
    )).toEqual({ kind: 'restore-projection' });
    workspace.dispose();
  });

  it('moves a persisted effect atomically and clears it when detached', () => {
    const scene = sceneWithEffects();
    const { workspace, parentA, parentB, effect } =
      workspaceWithProjectedEffect();
    effect.unplug();
    parentB.getInput(CHARACTER_BLOCK_INPUTS.effect)?.connection?.connect(
      effect.outputConnection!,
    );
    // Blockly dispatches the drag-start disconnect event after the final
    // connection already exists, so its newParentId is stale/empty. The
    // mutation must follow the authoritative workspace connection instead.
    expect(getCharacterEffectMutation(
      moveEvent(effect.id, parentA.id),
      workspace as Blockly.WorkspaceSvg,
      scene,
    )).toEqual({
      kind: 'move',
      fromNodeId: 'portrait-a',
      toNodeId: 'portrait-b',
      effect: shake,
    });

    workspace.dispose();

    const detachedProjection = workspaceWithProjectedEffect();
    detachedProjection.effect.unplug();
    const detachedWorkspace =
      detachedProjection.workspace as Blockly.WorkspaceSvg;
    detachedWorkspace.isDragging = () => true;
    expect(getCharacterEffectMutation(
      moveEvent(
        detachedProjection.effect.id,
        detachedProjection.parentA.id,
      ),
      detachedWorkspace,
      scene,
    )).toBeNull();

    detachedWorkspace.isDragging = () => false;
    expect(getCharacterEffectMutation(
      moveEvent(
        detachedProjection.effect.id,
        detachedProjection.parentA.id,
      ),
      detachedWorkspace,
      scene,
    )).toEqual({
      kind: 'update',
      nodeId: 'portrait-a',
      effect: null,
    });
    detachedProjection.workspace.dispose();
  });

  it('collects focused field drafts and resolves backend-first deletion ownership', () => {
    const scene = sceneWithEffects();
    const { workspace, effect } = workspaceWithProjectedEffect();
    effect.setFieldValue('0.75', 'DURATION_SECONDS');

    expect(collectCharacterEffectFieldDrafts(
      workspace as Blockly.WorkspaceSvg,
      scene,
    )).toEqual({
      drafts: [{
        nodeId: 'portrait-a',
        effect: { ...shake, durationMs: 750 },
      }],
      invalidNodeId: null,
    });
    expect(getCharacterEffectOwnerForDelete(
      workspace as Blockly.WorkspaceSvg,
      scene,
      effect.id,
    )).toBe('portrait-a');
    workspace.dispose();
  });
});
