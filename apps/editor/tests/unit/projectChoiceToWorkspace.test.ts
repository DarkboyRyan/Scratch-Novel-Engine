import * as Blockly from 'blockly';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  CHOICE_BLOCK_INPUTS,
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_FIELDS,
  CHOICE_OPTION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import { projectSceneToWorkspace } from '../../src/renderer/features/block-editor/projectSceneToWorkspace';

class FakeConnection {
  target: FakeConnection | null = null;

  constructor(readonly owner: FakeBlock) {}

  connect(other: FakeConnection): boolean {
    this.target = other;
    other.target = this;
    return true;
  }
}

class FakeBlock {
  readonly previousConnection = new FakeConnection(this);
  readonly nextConnection = new FakeConnection(this);
  readonly fields = new Map<string, string>();
  readonly inputs = new Map<string, { connection: FakeConnection }>();
  contextMenu = true;
  data: string | null = null;
  movedTo: { x: number; y: number } | null = null;

  constructor(
    readonly id: string,
    readonly type: string,
    readonly workspace: FakeWorkspace,
  ) {
    if (type === CHOICE_BLOCK_TYPE) {
      this.inputs.set(CHOICE_BLOCK_INPUTS.options, {
        connection: new FakeConnection(this),
      });
    }
  }

  setMovable(): void {}
  setDeletable(): void {}
  setEditable(): void {}
  setDragStrategy(): void {}
  initSvg(): void {}
  render(): void {}

  setFieldValue(value: string, name: string): void {
    this.fields.set(name, value);
  }

  getInput(name: string) {
    return this.inputs.get(name) ?? null;
  }

  moveBy(x: number, y: number): void {
    this.movedTo = { x, y };
  }
}

class FakeWorkspace {
  readonly blocks: FakeBlock[] = [];
  resized = false;

  clear(): void {
    this.blocks.length = 0;
  }

  newBlock(type: string, id: string): Blockly.BlockSvg {
    const block = new FakeBlock(id, type, this);
    this.blocks.push(block);
    return block as unknown as Blockly.BlockSvg;
  }

  clearUndo(): void {}

  resizeContents(): void {
    this.resized = true;
  }
}

describe('choice scene projection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rebuilds persisted options inside their container in snapshot order', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-1',
      name: '场景 1',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'choice-1',
          type: 'choice',
          options: [
            {
              id: 'option-1',
              text: '留下',
              targetSceneId: 'scene-1',
            },
            {
              id: 'option-2',
              text: '离开',
              targetSceneId: 'scene-2',
            },
          ],
        },
      ],
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    expect(workspace.blocks.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 'choice-1', type: CHOICE_BLOCK_TYPE },
      { id: 'option-1', type: CHOICE_OPTION_BLOCK_TYPE },
      { id: 'option-2', type: CHOICE_OPTION_BLOCK_TYPE },
    ]);
    const [choice, first, second] = workspace.blocks;
    expect(
      choice.inputs.get(CHOICE_BLOCK_INPUTS.options)?.connection.target
        ?.owner.id,
    ).toBe(first.id);
    expect(first.nextConnection.target?.owner.id).toBe(second.id);
    expect(
      first.fields.get(CHOICE_OPTION_BLOCK_FIELDS.text),
    ).toBe('留下');
    expect(
      second.fields.get(CHOICE_OPTION_BLOCK_FIELDS.targetScene),
    ).toBe('scene-2');
    expect(choice.movedTo).toEqual({ x: 120, y: 80 });
    expect(workspace.resized).toBe(true);
  });
});
