/**
 * 文件主要作用：验证 character portrait effect blocks 的行为。
 * 测试覆盖：`character portrait effect blocks`。
 */

import * as Blockly from 'blockly';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CHARACTER_BLOCK_INPUTS,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  registerCharacterBlock,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import {
  applyCharacterEffectBlockLocalization,
  CHARACTER_EFFECT_BLOCK_TYPES,
  CHARACTER_EFFECT_CONNECTION_TYPE,
  CHARACTER_EFFECT_FIELDS,
  CharacterEffectConnectionChecker,
  readCharacterEffectBlock,
  registerCharacterEffectBlocks,
  setCharacterEffectBlock,
} from '../../src/renderer/features/block-editor/blocks/characterEffectBlock';
import { createBlockEditorToolbox } from '../../src/renderer/features/block-editor/toolbox';
import { getEditorLabels } from '../../src/renderer/i18n/editorLocalization';

describe('character portrait effect blocks', () => {
  const workspaces: Blockly.Workspace[] = [];

  afterEach(() => {
    workspaces.splice(0).forEach((workspace) => workspace.dispose());
  });

  it('registers seven typed value blocks in a dedicated Effects category', () => {
    const labels = getEditorLabels('en-US');
    registerCharacterEffectBlocks(labels);
    registerCharacterBlock(labels);
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);

    for (const type of Object.values(CHARACTER_EFFECT_BLOCK_TYPES)) {
      const block = workspace.newBlock(type);
      expect(block.outputConnection?.getCheck()).toEqual([
        CHARACTER_EFFECT_CONNECTION_TYPE,
      ]);
      expect(readCharacterEffectBlock(block)).not.toBeNull();
    }

    const portrait = workspace.newBlock(CHARACTER_BLOCK_TYPE);
    const clear = workspace.newBlock(CLEAR_CHARACTER_BLOCK_TYPE);
    expect(
      portrait.getInput(CHARACTER_BLOCK_INPUTS.effect)?.connection?.getCheck(),
    ).toEqual([CHARACTER_EFFECT_CONNECTION_TYPE]);
    expect(clear.getInput(CHARACTER_BLOCK_INPUTS.effect)).toBeNull();

    const categories = (
      createBlockEditorToolbox(true, labels) as Blockly.utils.toolbox.ToolboxInfo
    ).contents;
    const effects = categories.find(
      (entry) => 'name' in entry && entry.name === 'Effects',
    );
    expect(effects && 'contents' in effects
      ? effects.contents?.map((entry) => 'type' in entry ? entry.type : null)
      : []).toEqual(Object.values(CHARACTER_EFFECT_BLOCK_TYPES));
  });

  it('round-trips all strict effect variants and preserves fields on localization', () => {
    const zh = getEditorLabels('zh-CN');
    const en = getEditorLabels('en-US');
    registerCharacterEffectBlocks(zh);
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const effects = [
      { type: 'shake', durationMs: 550, intensity: 'strong' },
      { type: 'jump', durationMs: 600, intensity: 'subtle' },
      { type: 'fadeIn', durationMs: 750 },
      { type: 'fadeOut', durationMs: 800 },
      {
        type: 'slideIn',
        durationMs: 900,
        intensity: 'normal',
        direction: 'right',
      },
      { type: 'breathe', durationMs: 1200, intensity: 'subtle' },
      { type: 'flash', durationMs: 450, intensity: 'strong' },
    ] as const;

    for (const effect of effects) {
      const block = workspace.newBlock(
        CHARACTER_EFFECT_BLOCK_TYPES[effect.type],
      );
      setCharacterEffectBlock(block, effect);
      applyCharacterEffectBlockLocalization(block, en);
      expect(readCharacterEffectBlock(block)).toEqual(effect);
      expect(block.getFieldValue(CHARACTER_EFFECT_FIELDS.durationSeconds))
        .toBe(effect.durationMs / 1000);
    }
  });

  it('rejects out-of-range or malformed values instead of clamping in the reader', () => {
    const invalid = {
      type: CHARACTER_EFFECT_BLOCK_TYPES.slideIn,
      getFieldValue: (name: string) =>
        name === CHARACTER_EFFECT_FIELDS.durationSeconds
          ? '10.001'
          : name === CHARACTER_EFFECT_FIELDS.intensity
            ? 'normal'
            : 'left',
    } as unknown as Blockly.Block;
    expect(readCharacterEffectBlock(invalid)).toBeNull();
  });

  it('does not displace an effect that already occupies a portrait input', () => {
    registerCharacterEffectBlocks();
    registerCharacterBlock();
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const portrait = workspace.newBlock(CHARACTER_BLOCK_TYPE);
    const current = workspace.newBlock(CHARACTER_EFFECT_BLOCK_TYPES.shake);
    const replacement = workspace.newBlock(CHARACTER_EFFECT_BLOCK_TYPES.jump);
    const input = portrait.getInput(CHARACTER_BLOCK_INPUTS.effect)?.connection;
    input?.connect(current.outputConnection!);

    const checker = new CharacterEffectConnectionChecker();
    expect(checker.canConnect(
      replacement.outputConnection,
      input ?? null,
      true,
      48,
    )).toBe(false);
  });
});
