/**
 * 文件主要作用：验证 choice scene projection 的行为。
 * 测试覆盖：`choice scene projection`。
 */

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
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/characterBlock';
import {
  BACKGROUND_BLOCK_FIELDS,
  BACKGROUND_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import {
  getSceneStartBlockId,
  SCENE_START_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/sceneStartBlock';
import { projectSceneToWorkspace } from '../../src/renderer/features/block-editor/projectSceneToWorkspace';
import {
  LOGIC_CONTROL_FIELDS,
  LOGIC_CONTROL_INPUTS,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  getLogicControlMarkers,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';
import {
  VARIABLE_BLOCK_FIELDS,
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/variableBlock';
import {
  CG_DISPLAY_BLOCK_TYPE,
  CG_DISPLAY_FIELDS,
  CG_DISPLAY_INPUTS,
  getCgDisplayMarkers,
} from '../../src/renderer/features/block-editor/blocks/cgDisplayBlock';

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
  private readonly scaleField: Blockly.FieldNumber | null;
  private readonly scaleFieldName: string | null;

  constructor(
    readonly id: string,
    readonly type: string,
    readonly workspace: FakeWorkspace,
  ) {
    this.scaleFieldName = type === CHARACTER_BLOCK_TYPE
      ? CHARACTER_BLOCK_FIELDS.scalePercent
      : type === BACKGROUND_BLOCK_TYPE
        ? BACKGROUND_BLOCK_FIELDS.scalePercent
        : null;
    this.scaleField = this.scaleFieldName
      ? new Blockly.FieldNumber(100, 10, 300, 1)
      : null;
    if (this.scaleField) {
      const setScaleValue = this.scaleField.setValue.bind(this.scaleField);
      this.scaleField.setValue = (value) => {
        setScaleValue(value);
        this.fields.set(
          this.scaleFieldName!,
          String(this.scaleField?.getValue()),
        );
      };
    }
    if (type === CHOICE_BLOCK_TYPE) {
      this.inputs.set(CHOICE_BLOCK_INPUTS.options, {
        connection: new FakeConnection(this),
      });
    } else if (type === LOGIC_IF_BLOCK_TYPE) {
      this.inputs.set(LOGIC_CONTROL_INPUTS.then, {
        connection: new FakeConnection(this),
      });
      this.inputs.set(LOGIC_CONTROL_INPUTS.else, {
        connection: new FakeConnection(this),
      });
    } else if (type === LOGIC_REPEAT_BLOCK_TYPE) {
      this.inputs.set(LOGIC_CONTROL_INPUTS.body, {
        connection: new FakeConnection(this),
      });
    } else if (type === CG_DISPLAY_BLOCK_TYPE) {
      this.inputs.set(CG_DISPLAY_INPUTS.body, {
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

  getInputTargetBlock(name: string): FakeBlock | null {
    return this.inputs.get(name)?.connection.target?.owner ?? null;
  }

  getField(name: string): Blockly.Field | null {
    return name === this.scaleFieldName
      ? this.scaleField
      : null;
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
      backgroundScalePercent: 100,
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

  it('projects a character with an image as a portrait block', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-character',
      name: '人物立绘',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [
        {
          id: 'character-1',
          type: 'character',
          mode: 'show',
          assetId: 'portrait-1',
          slot: 'center',
          layer: 1,
          position: null,
          effect: null,
          scalePercent: 145,
        },
      ],
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
      [{ id: 'portrait-1', type: 'image', displayName: 'Alice' }],
    );

    const portrait = workspace.blocks.find(
      (block) => block.id === 'character-1',
    );
    expect(portrait?.type).toBe(CHARACTER_BLOCK_TYPE);
    expect(
      portrait?.fields.get(CHARACTER_BLOCK_FIELDS.scalePercent),
    ).toBe('145');
  });

  it('projects a background-node scale into its number field', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-background',
      name: '背景',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [
        {
          id: 'background-1',
          type: 'background',
          assetId: 'room',
          scalePercent: 75,
        },
      ],
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
      [{ id: 'room', type: 'image', displayName: 'Room' }],
    );

    const background = workspace.blocks.find(
      (block) => block.id === 'background-1',
    );
    expect(background?.type).toBe(BACKGROUND_BLOCK_TYPE);
    expect(
      background?.fields.get(BACKGROUND_BLOCK_FIELDS.scalePercent),
    ).toBe('75');
  });

  it('keeps an unresolved show portrait in the story chain as a portrait block', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-unresolved-character',
      name: '未选图片的人物立绘',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [
        {
          id: 'character-placeholder',
          type: 'character',
          mode: 'show',
          assetId: null,
          slot: 'center',
          layer: 1,
          position: null,
          effect: null,
          scalePercent: 100,
        },
        {
          id: 'dialogue-after-character',
          type: 'dialogue',
          speaker: 'A',
          text: 'Hello',
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

    const portrait = workspace.blocks.find(
      (block) => block.id === 'character-placeholder',
    );
    expect(portrait?.type).toBe(CHARACTER_BLOCK_TYPE);
    expect(portrait?.fields.get(CHARACTER_BLOCK_FIELDS.assetName)).toBe('无');
    expect(portrait?.getNextBlock()?.id).toBe('dialogue-after-character');
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
      backgroundScalePercent: 100,
      nodes: [
        {
          id: 'clear-character-1',
          type: 'character',
          mode: 'clear',
          assetId: null,
          slot: 'center',
          layer: 4,
          position: null,
          effect: null,
          scalePercent: 100,
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
    expect(clearBlock?.fields.get(CHARACTER_BLOCK_FIELDS.layer)).toBe('4');
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
      backgroundScalePercent: 100,
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
      choice.inputs.get(CHOICE_BLOCK_INPUTS.options)?.connection.target?.owner
        .id,
    ).toBe(first.id);
    expect(first.nextConnection.target?.owner.id).toBe(second.id);
    expect(first.fields.get(CHOICE_OPTION_BLOCK_FIELDS.text)).toBe('留下');
    expect(second.fields.get(CHOICE_OPTION_BLOCK_FIELDS.targetScene)).toBe(
      'scene-2',
    );
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
      backgroundScalePercent: 100,
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
      continuation?.fields.get(STORY_CONTINUATION_BLOCK_FIELDS.sequence),
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
      backgroundScalePercent: 100,
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
    expect(blocks.slice(1).every((block) => block?.movedTo === null)).toBe(
      true,
    );
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
      backgroundScalePercent: 100,
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
    expect(
      workspace.blocks.slice(1).every((block) => block.movedTo === null),
    ).toBe(true);
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
      backgroundScalePercent: 100,
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

  it('projects paired markers as nested C blocks and never renders markers', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-logic',
      name: '逻辑场景',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [
        {
          id: 'set-1',
          type: 'variableSet',
          variableName: 'score',
          value: 3,
        },
        {
          id: 'if-1',
          type: 'logicIf',
          condition: {
            left: { kind: 'variable', name: 'score' },
            operator: 'gte',
            right: { kind: 'literal', value: 3 },
          },
        },
        { id: 'repeat-1', type: 'logicRepeat', count: 2 },
        {
          id: 'change-1',
          type: 'variableChange',
          variableName: 'score',
          amount: 1,
        },
        {
          id: 'repeat-end',
          type: 'logicEndRepeat',
          repeatNodeId: 'repeat-1',
        },
        { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
        {
          id: 'else-line',
          type: 'dialogue',
          speaker: 'B',
          text: 'Else',
          voiceAssetId: null,
        },
        { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
        {
          id: 'after-line',
          type: 'dialogue',
          speaker: 'A',
          text: 'After',
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

    expect(workspace.blocks.map((block) => block.id)).not.toContain('else-1');
    expect(workspace.blocks.map((block) => block.id)).not.toContain('if-end');
    expect(workspace.blocks.map((block) => block.id)).not.toContain(
      'repeat-end',
    );
    const set = workspace.blocks.find((block) => block.id === 'set-1');
    const ifBlock = workspace.blocks.find((block) => block.id === 'if-1');
    const repeat = workspace.blocks.find((block) => block.id === 'repeat-1');
    const change = workspace.blocks.find((block) => block.id === 'change-1');
    const elseLine = workspace.blocks.find((block) => block.id === 'else-line');
    const afterLine = workspace.blocks.find(
      (block) => block.id === 'after-line',
    );

    expect(set?.type).toBe(VARIABLE_SET_BLOCK_TYPE);
    expect(set?.fields.get(VARIABLE_BLOCK_FIELDS.name)).toBe('score');
    expect(set?.getNextBlock()).toBe(ifBlock);
    expect(ifBlock?.type).toBe(LOGIC_IF_BLOCK_TYPE);
    expect(ifBlock?.fields.get(LOGIC_CONTROL_FIELDS.operator)).toBe('gte');
    expect(ifBlock?.getInputTargetBlock(LOGIC_CONTROL_INPUTS.then)).toBe(
      repeat,
    );
    expect(ifBlock?.getInputTargetBlock(LOGIC_CONTROL_INPUTS.else)).toBe(
      elseLine,
    );
    expect(repeat?.type).toBe(LOGIC_REPEAT_BLOCK_TYPE);
    expect(repeat?.getInputTargetBlock(LOGIC_CONTROL_INPUTS.body)).toBe(change);
    expect(ifBlock?.getNextBlock()).toBe(afterLine);
    expect(getLogicControlMarkers(ifBlock as unknown as Blockly.Block)).toEqual(
      {
        kind: 'if',
        elseNodeId: 'else-1',
        endNodeId: 'if-end',
      },
    );
    expect(getLogicControlMarkers(repeat as unknown as Blockly.Block)).toEqual({
      kind: 'repeat',
      endNodeId: 'repeat-end',
    });
    expect(change?.type).toBe(VARIABLE_CHANGE_BLOCK_TYPE);
  });

  it('projects a CG C block inside If/Repeat while keeping its end marker hidden', () => {
    vi.spyOn(
      Blockly.renderManagement,
      'triggerQueuedRenders',
    ).mockImplementation(() => {});
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-nested-cg',
      name: 'Nested CG',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [
        { id: 'repeat-1', type: 'logicRepeat', count: 2 },
        {
          id: 'if-1',
          type: 'logicIf',
          condition: {
            left: { kind: 'variable', name: 'route' },
            operator: 'eq',
            right: { kind: 'literal', value: 'A' },
          },
        },
        {
          id: 'cg-1',
          type: 'cgDisplay',
          assetId: 'cg-image',
          leadInMs: 750,
        },
        {
          id: 'cg-line',
          type: 'dialogue',
          speaker: 'A',
          text: 'CG line',
          voiceAssetId: null,
        },
        {
          id: 'cg-end',
          type: 'cgEndDisplay',
          cgDisplayNodeId: 'cg-1',
        },
        { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
        { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if-1' },
        {
          id: 'repeat-end',
          type: 'logicEndRepeat',
          repeatNodeId: 'repeat-1',
        },
      ],
    };
    const workspace = new FakeWorkspace();

    projectSceneToWorkspace(
      scene,
      workspace as unknown as Blockly.WorkspaceSvg,
      { x: 120, y: 80 },
    );

    const repeat = workspace.blocks.find((block) => block.id === 'repeat-1');
    const ifBlock = workspace.blocks.find((block) => block.id === 'if-1');
    const cg = workspace.blocks.find((block) => block.id === 'cg-1');
    const line = workspace.blocks.find((block) => block.id === 'cg-line');
    expect(repeat?.getInputTargetBlock(LOGIC_CONTROL_INPUTS.body)).toBe(
      ifBlock,
    );
    expect(ifBlock?.getInputTargetBlock(LOGIC_CONTROL_INPUTS.then)).toBe(cg);
    expect(cg?.type).toBe(CG_DISPLAY_BLOCK_TYPE);
    expect(cg?.fields.get(CG_DISPLAY_FIELDS.leadInSeconds)).toBe('0.75');
    expect(cg?.getInputTargetBlock(CG_DISPLAY_INPUTS.body)).toBe(line);
    expect(workspace.blocks.map((block) => block.id)).not.toContain('cg-end');
    expect(getCgDisplayMarkers(cg as unknown as Blockly.Block)).toEqual({
      endNodeId: 'cg-end',
    });
  });
});
