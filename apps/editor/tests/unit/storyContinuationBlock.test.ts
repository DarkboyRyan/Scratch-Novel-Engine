import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as Blockly from 'blockly';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  registerStoryContinuationBlock,
  setStoryContinuationBlockSequence,
  STORY_CONTINUATION_BLOCK_FIELDS,
  STORY_CONTINUATION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/storyContinuationBlock';

describe('story continuation Blockly block', () => {
  const workspaces: Blockly.Workspace[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const workspace of workspaces) {
      workspace.dispose();
    }
    workspaces.length = 0;
  });

  function createBlock(): Blockly.Block {
    registerStoryContinuationBlock();
    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    return workspace.newBlock(STORY_CONTINUATION_BLOCK_TYPE);
  }

  it('is a page header with only a downward statement connection', () => {
    const block = createBlock();

    expect(block.previousConnection).toBeNull();
    expect(block.nextConnection).not.toBeNull();
  });

  it('exposes an enabled integer sequence input and constrains projected pages', () => {
    const block = createBlock();
    const field = block.getField(
      STORY_CONTINUATION_BLOCK_FIELDS.sequence,
    );

    expect(field).toBeInstanceOf(Blockly.FieldNumber);
    expect(field?.isEnabled()).toBe(true);
    expect(field?.isClickable()).toBe(true);
    expect(block.getFieldValue(
      STORY_CONTINUATION_BLOCK_FIELDS.sequence,
    )).toBe(1);

    setStoryContinuationBlockSequence(block, 2, 3);

    expect(block.getFieldValue(
      STORY_CONTINUATION_BLOCK_FIELDS.sequence,
    )).toBe(2);
    expect((field as Blockly.FieldNumber).getMin()).toBe(1);
    expect((field as Blockly.FieldNumber).getMax()).toBe(3);
    expect((field as Blockly.FieldNumber).getPrecision()).toBe(1);
  });

  it('rejects incomplete or out-of-range page numbers instead of clamping them', () => {
    const block = createBlock();
    const field = block.getField(
      STORY_CONTINUATION_BLOCK_FIELDS.sequence,
    ) as Blockly.FieldNumber;
    setStoryContinuationBlockSequence(block, 2, 3);

    for (const invalidValue of ['', 0, -1, 1.5, 4]) {
      field.setValue(invalidValue);
      expect(field.getValue()).toBe(2);
    }

    field.setValue(3);
    expect(field.getValue()).toBe(3);
  });

  it('marks the sequence field with the white editable-input style hook', () => {
    const block = createBlock();
    const field = block.getField(
      STORY_CONTINUATION_BLOCK_FIELDS.sequence,
    ) as Blockly.FieldNumber;
    const addClass = vi.fn();
    vi.spyOn(
      Blockly.FieldNumber.prototype,
      'initView',
    ).mockImplementation(() => {});
    vi.spyOn(field, 'getSvgRoot').mockReturnValue({
      classList: { add: addClass },
    } as unknown as SVGGElement);

    field.initView();

    expect(addClass).toHaveBeenCalledWith(
      'vn-story-continuation-sequence-field',
    );
  });

  it('keeps the sequence style white with dark readable text', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.vn-story-continuation-sequence-field[^}]+fill:\s*#ffffff/,
    );
    expect(css).toMatch(
      /\.vn-story-continuation-sequence-field text\s*\{[^}]+fill:\s*#242a32/,
    );
  });
});
