import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/shared/projectTypes';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import { BACKGROUND_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/backgroundBlock';
import { CHARACTER_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/characterBlock';
import { SCENE_JUMP_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/sceneJumpBlock';
import { BGM_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/bgmBlock';
import { CHOICE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import { STORY_CONTINUATION_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/storyContinuationBlock';
import { VIDEO_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/videoBlock';
import { VARIABLE_SET_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/variableBlock';
import {
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/logicControlBlock';
import {
  collectDialogueFieldDrafts,
  getDialogueFieldUpdate,
  getDroppedNewDialogueBlock,
  getNewStoryExtensionDropResolution,
  getReorderedDialogueBlock,
  getTimelineBeforeNodeIdForBlock,
  getTimelineReorderDropResolution,
} from '../../src/renderer/features/block-editor/dialogueBlockEvents';

const scene: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-1',
  name: '场景 1',
  backgroundAssetId: null,
  nodes: [
    {
      id: 'node-1',
      type: 'dialogue',
      speaker: 'A',
      text: '第一句',
      voiceAssetId: null,
    },
    {
      id: 'node-2',
      type: 'dialogue',
      speaker: 'B',
      text: '第二句',
      voiceAssetId: null,
    },
  ],
};

function createMoveEvent(
  blockId: string,
): Blockly.Events.BlockMove {
  return {
    type: Blockly.Events.BLOCK_MOVE,
    blockId,
    reason: ['drag'],
  } as Blockly.Events.BlockMove;
}

function createDialogueBlock(
  id: string,
  nextBlockId: string | null,
  previousBlockId: string | null = null,
): Blockly.BlockSvg {
  return {
    id,
    type: DIALOGUE_BLOCK_TYPE,
    getNextBlock: () =>
      nextBlockId === null
        ? null
        : ({ id: nextBlockId } as Blockly.Block),
    getPreviousBlock: () =>
      previousBlockId === null
        ? null
        : ({ id: previousBlockId } as Blockly.Block),
    getParent: () =>
      previousBlockId === null
        ? null
        : ({ id: previousBlockId } as Blockly.Block),
  } as Blockly.BlockSvg;
}

function createWorkspace(
  block: Blockly.BlockSvg,
): Blockly.WorkspaceSvg {
  return {
    getBlockById: (blockId: string) =>
      blockId === block.id ? block : null,
  } as Blockly.WorkspaceSvg;
}

type TopologyBlockDefinition = {
  id: string;
  type?: string;
  previousId?: string | null;
  nextId?: string | null;
};

function createTopologyWorkspace(
  definitions: TopologyBlockDefinition[],
): Blockly.WorkspaceSvg {
  const blocks = new Map<string, Blockly.BlockSvg>();

  for (const definition of definitions) {
    const block = {
      id: definition.id,
      type: definition.type ?? DIALOGUE_BLOCK_TYPE,
      getPreviousBlock: () =>
        definition.previousId
          ? blocks.get(definition.previousId) ?? null
          : null,
      getNextBlock: () =>
        definition.nextId
          ? blocks.get(definition.nextId) ?? null
          : null,
    } as unknown as Blockly.BlockSvg;
    blocks.set(definition.id, block);
  }

  return {
    getBlockById: (blockId: string) => blocks.get(blockId) ?? null,
  } as Blockly.WorkspaceSvg;
}

describe('timeline anchors after top-level logic controls', () => {
  const condition = {
    left: { kind: 'variable' as const, name: 'route' },
    operator: 'eq' as const,
    right: { kind: 'literal' as const, value: 'A' },
  };

  it.each([
    {
      name: 'empty If',
      rootId: 'if-empty',
      nodes: [
        { id: 'if-empty', type: 'logicIf' as const, condition },
        { id: 'else-empty', type: 'logicElse' as const, ifNodeId: 'if-empty' },
        { id: 'endif-empty', type: 'logicEndIf' as const, ifNodeId: 'if-empty' },
      ],
      expected: null,
    },
    {
      name: 'populated If',
      rootId: 'if-full',
      nodes: [
        { id: 'if-full', type: 'logicIf' as const, condition },
        {
          id: 'then-line',
          type: 'dialogue' as const,
          speaker: 'A',
          text: 'Then',
          voiceAssetId: null,
        },
        { id: 'else-full', type: 'logicElse' as const, ifNodeId: 'if-full' },
        {
          id: 'else-line',
          type: 'dialogue' as const,
          speaker: 'B',
          text: 'Else',
          voiceAssetId: null,
        },
        { id: 'endif-full', type: 'logicEndIf' as const, ifNodeId: 'if-full' },
        {
          id: 'after-if',
          type: 'dialogue' as const,
          speaker: 'C',
          text: 'After',
          voiceAssetId: null,
        },
      ],
      expected: 'after-if',
    },
    {
      name: 'empty Repeat',
      rootId: 'repeat-empty',
      nodes: [
        { id: 'repeat-empty', type: 'logicRepeat' as const, count: 2 },
        {
          id: 'endrepeat-empty',
          type: 'logicEndRepeat' as const,
          repeatNodeId: 'repeat-empty',
        },
      ],
      expected: null,
    },
    {
      name: 'populated Repeat',
      rootId: 'repeat-full',
      nodes: [
        { id: 'repeat-full', type: 'logicRepeat' as const, count: 2 },
        {
          id: 'body-line',
          type: 'dialogue' as const,
          speaker: 'A',
          text: 'Body',
          voiceAssetId: null,
        },
        {
          id: 'endrepeat-full',
          type: 'logicEndRepeat' as const,
          repeatNodeId: 'repeat-full',
        },
        {
          id: 'after-repeat',
          type: 'dialogue' as const,
          speaker: 'B',
          text: 'After',
          voiceAssetId: null,
        },
      ],
      expected: 'after-repeat',
    },
  ])('skips the complete paired-marker range for $name', ({
    rootId,
    nodes,
    expected,
  }) => {
    const logicScene: SceneDocument = {
      ...scene,
      nodes,
    };
    const block = createDialogueBlock('temporary', null, rootId);

    expect(getTimelineBeforeNodeIdForBlock(block, logicScene)).toBe(
      expected,
    );
  });

  it.each([
    ['dialogue', DIALOGUE_BLOCK_TYPE],
    ['media', VIDEO_BLOCK_TYPE],
    ['variable', VARIABLE_SET_BLOCK_TYPE],
    ['If control', LOGIC_IF_BLOCK_TYPE],
    ['Repeat control', LOGIC_REPEAT_BLOCK_TYPE],
  ])('uses the same post-control anchor for a new %s block', (_label, type) => {
    const logicScene: SceneDocument = {
      ...scene,
      nodes: [
        { id: 'if-1', type: 'logicIf', condition },
        {
          id: 'then-line',
          type: 'dialogue',
          speaker: 'A',
          text: 'Then',
          voiceAssetId: null,
        },
        { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
        { id: 'endif-1', type: 'logicEndIf', ifNodeId: 'if-1' },
        {
          id: 'after-if',
          type: 'dialogue',
          speaker: 'B',
          text: 'After',
          voiceAssetId: null,
        },
      ],
    };
    const block = {
      ...createDialogueBlock('temporary', null, 'if-1'),
      type,
    } as Blockly.BlockSvg;

    expect(getTimelineBeforeNodeIdForBlock(block, logicScene)).toBe(
      'after-if',
    );
  });
});

describe('getDroppedNewDialogueBlock', () => {
  it('uses the connected next scene node as beforeNodeId', () => {
    const block = createDialogueBlock('temporary-block', 'node-2');

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      block,
      beforeNodeId: 'node-2',
    });
  });

  it('appends when the new block is connected after the final scene node', () => {
    const block = createDialogueBlock(
      'temporary-block',
      null,
      'node-2',
    );

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      block,
      beforeNodeId: null,
    });
  });

  it('appends a dialogue connected below a terminal extension', () => {
    const terminalExtensionScene: SceneDocument = {
      ...scene,
      nodes: [
        ...scene.nodes,
        { id: 'extension-last', type: 'storyExtension' },
      ],
    };
    const block = createDialogueBlock(
      'temporary-block',
      null,
      'extension-last',
    );

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        terminalExtensionScene,
      ),
    ).toEqual({ block, beforeNodeId: null });
  });

  it('uses the authoritative successor after an explicit jump page', () => {
    const jumpingScene: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        {
          id: 'jump-1',
          type: 'sceneJump',
          targetSceneId: 'scene-2',
        },
        scene.nodes[1],
      ],
    };
    const block = createDialogueBlock(
      'temporary-block',
      null,
      'jump-1',
    );

    expect(
      getTimelineBeforeNodeIdForBlock(block, jumpingScene),
    ).toBe('node-2');
  });

  it('does not commit a new block that is not touching the scene chain', () => {
    const block = createDialogueBlock('temporary-block', null);

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });

  it('allows an unconnected block to become the first node of an empty scene', () => {
    const block = createDialogueBlock('temporary-block', null);
    const emptyScene: SceneDocument = {
      ...scene,
      nodes: [],
    };

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        emptyScene,
      ),
    ).toEqual({ block, beforeNodeId: null });
  });

  it('ignores blocks that already came from the C++ scene snapshot', () => {
    const block = createDialogueBlock('node-1', 'node-2');

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });

  it('ignores automatic moves that were not caused by a user drag', () => {
    const block = createDialogueBlock('temporary-block', 'node-2');
    const event = createMoveEvent(block.id);
    event.reason = ['bump'];

    expect(
      getDroppedNewDialogueBlock(
        event,
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });

  it('does not mistake a new background block for a dialogue', () => {
    const block = {
      ...createDialogueBlock('temporary-background', 'node-2'),
      type: BACKGROUND_BLOCK_TYPE,
    } as Blockly.BlockSvg;

    expect(
      getDroppedNewDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });

  it('does not mistake a new scene jump block for a dialogue', () => {
    const block = {
      ...createDialogueBlock('temporary-scene-jump', 'node-2'),
      type: SCENE_JUMP_BLOCK_TYPE,
    } as Blockly.BlockSvg;
    expect(getDroppedNewDialogueBlock(
      createMoveEvent(block.id),
      createWorkspace(block),
      scene,
    )).toBeNull();
  });
});

describe('getNewStoryExtensionDropResolution', () => {
  function extensionBlock(
    id: string,
    nextBlockId: string | null,
    previousBlockId: string | null = null,
  ): Blockly.BlockSvg {
    return {
      ...createDialogueBlock(id, nextBlockId, previousBlockId),
      type: STORY_CONTINUATION_BLOCK_TYPE,
    } as Blockly.BlockSvg;
  }

  it('adds a toolbox extension immediately above a persisted node', () => {
    const block = extensionBlock('temporary-extension', 'node-2');

    expect(
      getNewStoryExtensionDropResolution(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      kind: 'add',
      drop: { block, beforeNodeId: 'node-2' },
    });
  });

  it('allows an isolated top-level extension to append an empty page', () => {
    const block = extensionBlock('temporary-extension', null);

    expect(
      getNewStoryExtensionDropResolution(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      kind: 'add',
      drop: { block, beforeNodeId: null },
    });
  });

  it('rolls back an extension whose next child is still temporary', () => {
    const block = extensionBlock('temporary-extension', 'temporary-child');

    expect(
      getNewStoryExtensionDropResolution(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({ kind: 'rollback' });
  });

  it('rolls back an extension that acquired an invalid previous connection', () => {
    const block = extensionBlock(
      'temporary-extension',
      null,
      'node-2',
    );

    expect(
      getNewStoryExtensionDropResolution(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({ kind: 'rollback' });
  });

  it('ignores an extension that already belongs to the scene', () => {
    const sceneWithExtension: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        { id: 'extension-1', type: 'storyExtension' },
        scene.nodes[1],
      ],
    };
    const block = extensionBlock('extension-1', 'node-2');

    expect(
      getNewStoryExtensionDropResolution(
        createMoveEvent(block.id),
        createWorkspace(block),
        sceneWithExtension,
      ),
    ).toBeNull();
  });
});

describe('getDialogueFieldUpdate', () => {
  function createChangeEvent(blockId: string): Blockly.Events.BlockChange {
    return {
      type: Blockly.Events.BLOCK_CHANGE,
      blockId,
      element: 'field',
      name: 'SPEAKER',
    } as Blockly.Events.BlockChange;
  }

  it('ignores edits on an unconnected temporary block', () => {
    const block = {
      ...createDialogueBlock('temporary-block', null),
      getFieldValue: () => 'Alice',
    } as unknown as Blockly.BlockSvg;

    expect(
      getDialogueFieldUpdate(
        createChangeEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });
});

describe('collectDialogueFieldDrafts', () => {
  function blockWithFields(
    id: string,
    speaker: string,
    text: string,
  ): Blockly.BlockSvg {
    return {
      ...createDialogueBlock(id, null),
      getFieldValue: (fieldName: string) =>
        fieldName === 'SPEAKER' ? speaker : text,
    } as unknown as Blockly.BlockSvg;
  }

  function workspaceWithBlocks(
    blocks: Blockly.BlockSvg[],
  ): Blockly.WorkspaceSvg {
    return {
      getBlockById: (blockId: string) =>
        blocks.find((block) => block.id === blockId) ?? null,
    } as Blockly.WorkspaceSvg;
  }

  it('collects current Blockly values that differ from the C++ scene', () => {
    const workspace = workspaceWithBlocks([
      blockWithFields('node-1', 'Alice', '输入框中的新文字'),
      blockWithFields('node-2', 'B', '第二句'),
    ]);

    expect(collectDialogueFieldDrafts(workspace, scene)).toEqual([
      {
        nodeId: 'node-1',
        speaker: 'Alice',
        text: '输入框中的新文字',
      },
    ]);
  });

  it('ignores unchanged or missing projected blocks', () => {
    const workspace = workspaceWithBlocks([
      blockWithFields('node-1', 'A', '第一句'),
    ]);

    expect(collectDialogueFieldDrafts(workspace, scene)).toEqual([]);
  });
});

describe('getReorderedDialogueBlock', () => {
  it('uses the next connected scene node as the arbitrary drop anchor', () => {
    const block = createDialogueBlock('node-2', 'node-1');

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      nodeId: 'node-2',
      beforeNodeId: 'node-1',
    });
  });

  it('uses null when an existing dialogue is dropped at the end', () => {
    const block = createDialogueBlock('node-1', null);

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toEqual({
      nodeId: 'node-1',
      beforeNodeId: null,
    });
  });

  it('ignores a block dropped back at its original position', () => {
    const block = createDialogueBlock('node-1', 'node-2');

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        scene,
      ),
    ).toBeNull();
  });

  it('ignores a page-body block returned to its original header chain', () => {
    const sceneWithExtension: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        { id: 'extension-1', type: 'storyExtension' },
        scene.nodes[1],
      ],
    };
    const workspace = createTopologyWorkspace([
      { id: 'node-1', previousId: null, nextId: null },
      {
        id: 'extension-1',
        type: STORY_CONTINUATION_BLOCK_TYPE,
        previousId: null,
        nextId: 'node-2',
      },
      {
        id: 'node-2',
        previousId: 'extension-1',
        nextId: null,
      },
    ]);

    expect(
      getReorderedDialogueBlock(
        createMoveEvent('node-2'),
        workspace,
        sceneWithExtension,
      ),
    ).toBeNull();
  });

  it('reorders a persisted background node in the same timeline', () => {
    const mixedScene: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        { id: 'background-1', type: 'background', assetId: 'image-1' },
        scene.nodes[1],
      ],
    };
    const block = {
      ...createDialogueBlock('background-1', 'node-1'),
      type: BACKGROUND_BLOCK_TYPE,
    } as Blockly.BlockSvg;

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        mixedScene,
      ),
    ).toEqual({
      nodeId: 'background-1',
      beforeNodeId: 'node-1',
    });
  });

  it('reorders a persisted character node in the same timeline', () => {
    const mixedScene: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        {
          id: 'character-1',
          type: 'character',
          assetId: 'image-1',
          slot: 'left',
          layer: 2,
          position: null,
        },
        scene.nodes[1],
      ],
    };
    const block = {
      ...createDialogueBlock('character-1', 'node-1'),
      type: CHARACTER_BLOCK_TYPE,
    } as Blockly.BlockSvg;

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        mixedScene,
      ),
    ).toEqual({
      nodeId: 'character-1',
      beforeNodeId: 'node-1',
    });
  });

  it('reorders a persisted BGM node in the same timeline', () => {
    const mixedScene: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        { id: 'bgm-1', type: 'bgm', assetId: null },
        scene.nodes[1],
      ],
    };
    const block = {
      ...createDialogueBlock('bgm-1', 'node-1'),
      type: BGM_BLOCK_TYPE,
    } as Blockly.BlockSvg;

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        mixedScene,
      ),
    ).toEqual({
      nodeId: 'bgm-1',
      beforeNodeId: 'node-1',
    });
  });

  it('reorders a Choice container as one timeline node', () => {
    const mixedScene: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        {
          id: 'choice-1',
          type: 'choice',
          options: [
            {
              id: 'option-1',
              text: '继续',
              targetSceneId: 'scene-2',
            },
          ],
        },
        scene.nodes[1],
      ],
    };
    const block = {
      ...createDialogueBlock('choice-1', 'node-1'),
      type: CHOICE_BLOCK_TYPE,
    } as Blockly.BlockSvg;

    expect(
      getReorderedDialogueBlock(
        createMoveEvent(block.id),
        createWorkspace(block),
        mixedScene,
      ),
    ).toEqual({
      nodeId: 'choice-1',
      beforeNodeId: 'node-1',
    });
  });
});

describe('timeline reorder manual-extension restoration', () => {
  const extensionScene: SceneDocument = {
    ...scene,
    id: 'scene-with-extension',
    nodes: [
      scene.nodes[0],
      { id: 'extension-1', type: 'storyExtension' },
      scene.nodes[1],
    ],
  };

  it('keeps a canonical page-header no-op without an unnecessary restore', () => {
    const workspace = createTopologyWorkspace([
      { id: 'node-1', previousId: null, nextId: null },
      {
        id: 'extension-1',
        type: STORY_CONTINUATION_BLOCK_TYPE,
        previousId: null,
        nextId: 'node-2',
      },
      {
        id: 'node-2',
        previousId: 'extension-1',
        nextId: null,
      },
    ]);

    expect(
      getTimelineReorderDropResolution(
        createMoveEvent('node-2'),
        workspace,
        extensionScene,
      ),
    ).toBeNull();
  });

  it('restores a semantic no-op whose other page topology was damaged', () => {
    const workspace = createTopologyWorkspace([
      { id: 'node-1', previousId: null, nextId: 'extension-1' },
      {
        id: 'extension-1',
        type: STORY_CONTINUATION_BLOCK_TYPE,
        previousId: 'node-1',
        nextId: 'node-2',
      },
      { id: 'node-2', previousId: 'extension-1', nextId: null },
    ]);

    expect(
      getTimelineReorderDropResolution(
        createMoveEvent('node-2'),
        workspace,
        extensionScene,
      ),
    ).toEqual({ kind: 'restore-projection' });
  });

  it('restores a persistent extension dragged outside its page', () => {
    const workspace = createTopologyWorkspace([
      { id: 'node-1', previousId: null, nextId: null },
      {
        id: 'extension-1',
        type: STORY_CONTINUATION_BLOCK_TYPE,
        previousId: null,
        nextId: 'node-2',
      },
      { id: 'node-2', previousId: 'extension-1', nextId: null },
    ]);

    expect(
      getTimelineReorderDropResolution(
        createMoveEvent('extension-1'),
        workspace,
        extensionScene,
      ),
    ).toEqual({ kind: 'restore-projection' });
  });

  it('restores when a post-jump page root is reconnected below the jump', () => {
    const jumpingScene: SceneDocument = {
      ...scene,
      id: 'scene-jump-pagination',
      nodes: [
        scene.nodes[0],
        {
          id: 'jump-1',
          type: 'sceneJump',
          targetSceneId: 'scene-2',
        },
        scene.nodes[1],
      ],
    };
    const workspace = createTopologyWorkspace([
      {
        id: 'node-1',
        previousId: null,
        nextId: 'jump-1',
      },
      {
        id: 'jump-1',
        type: SCENE_JUMP_BLOCK_TYPE,
        previousId: 'node-1',
        nextId: 'node-2',
      },
      {
        id: 'node-2',
        previousId: 'jump-1',
        nextId: null,
      },
    ]);

    expect(
      getTimelineReorderDropResolution(
        createMoveEvent('node-2'),
        workspace,
        jumpingScene,
      ),
    ).toEqual({ kind: 'restore-projection' });
  });
});
