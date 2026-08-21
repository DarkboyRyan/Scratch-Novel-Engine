import * as Blockly from 'blockly';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import {
  CHOICE_BLOCK_INPUTS,
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_FIELDS,
  CHOICE_OPTION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import {
  STORY_CONTINUATION_BLOCK_FIELDS,
  STORY_CONTINUATION_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/storyContinuationBlock';
import {
  CHARACTER_BLOCK_FIELDS,
  CLEAR_CHARACTER_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import {
  getSceneStartBlockId,
  SCENE_START_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/sceneStartBlock';
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
  movable = true;
  deletable = true;
  editable = true;

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

  setMovable(value: boolean): void {
    this.movable = value;
  }
  setDeletable(value: boolean): void {
    this.deletable = value;
  }
  setEditable(value: boolean): void {
    this.editable = value;
  }
  setDragStrategy(): void {}
  initSvg(): void {}
  render(): void {}

  setFieldValue(value: string, name: string): void {
    this.fields.set(name, value);
  }

  getInput(name: string) {
    return this.inputs.get(name) ?? null;
  }

  getField(): Blockly.Field | null {
    return null;
  }

  getNextBlock(): FakeBlock | null {
    return this.nextConnection.target?.owner ?? null;
  }

  getPreviousBlock(): FakeBlock | null {
    return this.previousConnection.target?.owner ?? null;
  }

  getBoundingRectangle(): Blockly.utils.Rect {
    return new Blockly.utils.Rect(0, 100, 0, 300);
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

  it('projects a fixed start block even when the scene is empty', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-empty',
      name: '空场景',
      backgroundAssetId: null,
      nodes: [],
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    expect(workspace.blocks).toHaveLength(1);
    expect(workspace.blocks[0]).toMatchObject({
      id: getSceneStartBlockId(scene.id),
      type: SCENE_START_BLOCK_TYPE,
      movable: false,
      deletable: false,
      editable: false,
      contextMenu: false,
      movedTo: { x: 120, y: 80 },
    });
  });

  it('projects an empty character layer as the dedicated clear-portrait block', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-clear-character',
      name: '清除立绘',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'clear-character-1',
          type: 'character',
          assetId: null,
          slot: 'center',
          layer: 4,
          position: null,
        },
      ],
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    expect(workspace.blocks).toHaveLength(2);
    const clearBlock = workspace.blocks.find(
      (block) => block.type === CLEAR_CHARACTER_BLOCK_TYPE,
    );
    expect(clearBlock).toBeDefined();
    expect(
      clearBlock?.fields.get(CHARACTER_BLOCK_FIELDS.layer),
    ).toBe('4');
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
      {
        id: getSceneStartBlockId(scene.id),
        type: SCENE_START_BLOCK_TYPE,
      },
      { id: 'choice-1', type: CHOICE_BLOCK_TYPE },
      { id: 'option-1', type: CHOICE_OPTION_BLOCK_TYPE },
      { id: 'option-2', type: CHOICE_OPTION_BLOCK_TYPE },
    ]);
    const [start, choice, first, second] = workspace.blocks;
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
    expect(start.getNextBlock()).toBe(choice);
    expect(start.movedTo).toEqual({ x: 120, y: 80 });
    expect(choice.movedTo).toBeNull();
    expect(workspace.resized).toBe(true);
  });

  it('projects a persistent extension as an editable numbered page header', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const nodes: SceneDocument['nodes'] = [
      {
        id: 'dialogue-1',
        type: 'dialogue',
        speaker: '旁白',
        text: '第一句',
        voiceAssetId: null,
      },
      {
        id: 'dialogue-2',
        type: 'dialogue',
        speaker: '旁白',
        text: '第二句',
        voiceAssetId: null,
      },
      { id: 'extension-stable-id', type: 'storyExtension' },
      {
        id: 'dialogue-3',
        type: 'dialogue',
        speaker: '旁白',
        text: '第三句',
        voiceAssetId: null,
      },
      {
        id: 'dialogue-4',
        type: 'dialogue',
        speaker: '旁白',
        text: '第四句',
        voiceAssetId: null,
      },
    ];
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-long',
      name: '长场景',
      backgroundAssetId: null,
      nodes,
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    const continuation = workspace.blocks.find(
      (block) => block.type === STORY_CONTINUATION_BLOCK_TYPE,
    );
    expect(continuation).toBeDefined();
    expect(
      continuation?.fields.get(
        STORY_CONTINUATION_BLOCK_FIELDS.sequence,
      ),
    ).toBe('1');
    expect(continuation?.id).toBe('extension-stable-id');
    expect(continuation).toMatchObject({
      movable: false,
      deletable: false,
      editable: true,
      contextMenu: false,
    });

    const firstPageRoot = workspace.blocks.find(
      (block) => block.id === 'dialogue-1',
    );
    const firstPageTail = workspace.blocks.find(
      (block) => block.id === 'dialogue-2',
    );
    const secondPageFirstNode = workspace.blocks.find(
      (block) => block.id === 'dialogue-3',
    );
    const secondPageTail = workspace.blocks.find(
      (block) => block.id === 'dialogue-4',
    );
    const start = workspace.blocks.find(
      (block) => block.type === SCENE_START_BLOCK_TYPE,
    );
    expect(firstPageRoot?.getPreviousBlock()).toBe(start);
    expect(firstPageRoot?.getNextBlock()).toBe(firstPageTail);
    expect(firstPageTail?.getNextBlock()).toBeNull();
    expect(continuation?.getPreviousBlock()).toBeNull();
    expect(continuation?.getNextBlock()).toBe(secondPageFirstNode);
    expect(secondPageFirstNode?.getPreviousBlock()).toBe(continuation);
    expect(secondPageFirstNode?.getNextBlock()).toBe(secondPageTail);
    expect(start?.movedTo).toEqual({ x: 120, y: 80 });
    expect(firstPageRoot?.movedTo).toBeNull();
    expect(continuation?.movedTo).toEqual({ x: 540, y: 80 });
    expect(scene.nodes).toEqual(nodes);
  });

  it('reconnects both page bodies into one chain after extension deletion', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-after-extension-delete',
      name: '删除延伸后的场景',
      backgroundAssetId: null,
      nodes: [1, 2, 3, 4].map((index) => ({
        id: `dialogue-${index}`,
        type: 'dialogue' as const,
        speaker: '旁白',
        text: `第 ${index} 句`,
        voiceAssetId: null,
      })),
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    const blocks = scene.nodes.map((node) =>
      workspace.blocks.find((block) => block.id === node.id),
    );
    const start = workspace.blocks.find(
      (block) => block.type === SCENE_START_BLOCK_TYPE,
    );
    expect(blocks[0]?.getPreviousBlock()).toBe(start);
    expect(blocks[0]?.getNextBlock()).toBe(blocks[1]);
    expect(blocks[1]?.getNextBlock()).toBe(blocks[2]);
    expect(blocks[2]?.getNextBlock()).toBe(blocks[3]);
    expect(blocks[3]?.getNextBlock()).toBeNull();
    expect(start?.movedTo).toEqual({ x: 120, y: 80 });
    expect(blocks[0]?.movedTo).toBeNull();
    expect(blocks.slice(1).every((block) => block?.movedTo === null))
      .toBe(true);
  });

  it('keeps a long timeline in one column without a user extension', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const nodes = Array.from({ length: 12 }, (_, index) => ({
      id: `dialogue-${index + 1}`,
      type: 'dialogue' as const,
      speaker: '旁白',
      text: `第 ${index + 1} 句`,
      voiceAssetId: null,
    }));
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-long-without-extension',
      name: '长场景',
      backgroundAssetId: null,
      nodes,
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    expect(
      workspace.blocks.filter(
        (block) => block.type === STORY_CONTINUATION_BLOCK_TYPE,
      ),
    ).toHaveLength(0);
    expect(workspace.blocks[0].movedTo).toEqual({ x: 120, y: 80 });
    expect(workspace.blocks.slice(1).every((block) => block.movedTo === null))
      .toBe(true);
  });

  it('starts a separate page after an explicit jump without a continuation', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-jump',
      name: '跳转场景',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'dialogue-before',
          type: 'dialogue',
          speaker: '旁白',
          text: '跳转前',
          voiceAssetId: null,
        },
        {
          id: 'jump-1',
          type: 'sceneJump',
          targetSceneId: 'scene-target',
        },
        {
          id: 'dialogue-after',
          type: 'dialogue',
          speaker: '旁白',
          text: '不会自动相连',
          voiceAssetId: null,
        },
      ],
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    expect(
      workspace.blocks.filter(
        (block) => block.type === STORY_CONTINUATION_BLOCK_TYPE,
      ),
    ).toHaveLength(0);
    const jump = workspace.blocks.find((block) => block.id === 'jump-1');
    const after = workspace.blocks.find(
      (block) => block.id === 'dialogue-after',
    );
    expect(jump?.getNextBlock()).toBeNull();
    expect(after?.getPreviousBlock()).toBeNull();
    expect(after?.movedTo).toEqual({ x: 540, y: 80 });
  });
});
