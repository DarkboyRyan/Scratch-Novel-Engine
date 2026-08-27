/**
 * 文件主要作用：验证 captureSceneWorkspaceLayout、restoreSceneWorkspaceViewport 的行为。
 * 测试覆盖：`captureSceneWorkspaceLayout`、`restoreSceneWorkspaceViewport`。
 */

import type * as Blockly from 'blockly';
import { describe, expect, it, vi } from 'vitest';

import {
  captureSceneWorkspaceLayout,
  restoreSceneWorkspaceViewport,
  type SceneWorkspaceLayout,
} from '../../src/renderer/features/block-editor/blockEditorLayout';
import { DIALOGUE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import { BGM_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/bgmBlock';
import { CHOICE_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/choiceBlock';
import { STORY_CONTINUATION_BLOCK_TYPE } from '../../src/renderer/features/block-editor/blocks/storyContinuationBlock';
import type { SceneDocument } from '../../src/shared/projectTypes';

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

function createRootBlock(
  id: string,
  descendantIds: string[],
  x: number,
  y: number,
  type = DIALOGUE_BLOCK_TYPE,
): Blockly.BlockSvg {
  const root = {
    id,
    type,
    getDescendants: () =>
      descendantIds.map((descendantId) => ({ id: descendantId })),
    getRelativeToSurfaceXY: () => ({ x, y }),
    getRootBlock: () => root,
  };

  return root as unknown as Blockly.BlockSvg;
}

function createWorkspace(
  roots: Blockly.BlockSvg[],
  {
    scale = 0.9,
    scrollX = -40,
    scrollY = -20,
  } = {},
): Blockly.WorkspaceSvg {
  return {
    getTopBlocks: () => roots,
    getScale: () => scale,
    scrollX,
    scrollY,
  } as unknown as Blockly.WorkspaceSvg;
}

describe('captureSceneWorkspaceLayout', () => {
  it('captures the complete dialogue chain and current viewport', () => {
    const root = createRootBlock(
      'node-1',
      ['node-1', 'node-2'],
      240,
      180,
    );

    expect(
      captureSceneWorkspaceLayout(
        scene,
        createWorkspace([root]),
      ),
    ).toEqual({
      rootPosition: { x: 240, y: 180 },
      scale: 0.9,
      scrollX: -40,
      scrollY: -20,
    });
  });

  it('does not let a temporarily split stack replace the saved root', () => {
    const previousLayout: SceneWorkspaceLayout = {
      rootPosition: { x: 240, y: 180 },
      scale: 0.9,
      scrollX: -40,
      scrollY: -20,
    };
    const first = createRootBlock('node-1', ['node-1'], 600, 400);
    const second = createRootBlock('node-2', ['node-2'], 240, 270);

    expect(
      captureSceneWorkspaceLayout(
        scene,
        createWorkspace([first, second], {
          scale: 1.1,
          scrollX: -120,
          scrollY: -80,
        }),
        previousLayout,
      ),
    ).toEqual({
      rootPosition: { x: 240, y: 180 },
      scale: 1.1,
      scrollX: -120,
      scrollY: -80,
    });
  });

  it('uses the actual first drop position in an empty scene', () => {
    const emptyScene: SceneDocument = {
      ...scene,
      nodes: [],
    };
    const temporaryBlock = createRootBlock(
      'temporary-id',
      ['temporary-id'],
      520,
      310,
    );

    expect(
      captureSceneWorkspaceLayout(
        emptyScene,
        createWorkspace([temporaryBlock]),
        undefined,
        { preferredRoot: temporaryBlock },
      ).rootPosition,
    ).toEqual({ x: 520, y: 310 });
  });

  it('keeps the root position when a BGM node starts the timeline', () => {
    const bgmScene: SceneDocument = {
      ...scene,
      nodes: [
        { id: 'bgm-1', type: 'bgm', assetId: null },
        ...scene.nodes,
      ],
    };
    const root = createRootBlock(
      'bgm-1',
      ['bgm-1', 'node-1', 'node-2'],
      360,
      210,
      BGM_BLOCK_TYPE,
    );

    expect(
      captureSceneWorkspaceLayout(
        bgmScene,
        createWorkspace([root]),
      ).rootPosition,
    ).toEqual({ x: 360, y: 210 });
  });

  it('counts a Choice container as one top-level timeline node', () => {
    const choiceScene: SceneDocument = {
      ...scene,
      nodes: [
        {
          id: 'choice-1',
          type: 'choice',
          options: [
            {
              id: 'option-1',
              text: '继续',
              targetSceneId: 'scene-1',
            },
          ],
        },
        ...scene.nodes,
      ],
    };
    const root = createRootBlock(
      'choice-1',
      // getDescendants also contains the nested option, but layout completeness
      // counts only IDs from Scene.nodes.
      ['choice-1', 'option-1', 'node-1', 'node-2'],
      410,
      260,
      CHOICE_BLOCK_TYPE,
    );

    expect(
      captureSceneWorkspaceLayout(
        choiceScene,
        createWorkspace([root]),
      ).rootPosition,
    ).toEqual({ x: 410, y: 260 });
  });

  it('uses a complete manually extended first page as the anchor', () => {
    const paginatedScene: SceneDocument = {
      ...scene,
      nodes: [
        scene.nodes[0],
        { id: 'extension-1', type: 'storyExtension' },
        scene.nodes[1],
      ],
    };
    const firstPage = createRootBlock(
      'node-1',
      ['node-1'],
      470,
      290,
    );
    const secondPage = createRootBlock(
      'extension-1',
      ['extension-1', 'node-2'],
      890,
      290,
      STORY_CONTINUATION_BLOCK_TYPE,
    );

    expect(
      captureSceneWorkspaceLayout(
        paginatedScene,
        createWorkspace([firstPage, secondPage]),
      ).rootPosition,
    ).toEqual({ x: 470, y: 290 });
  });

  it('uses a marker-only first page as a stable anchor', () => {
    const markerScene: SceneDocument = {
      ...scene,
      nodes: [
        { id: 'extension-1', type: 'storyExtension' },
        ...scene.nodes,
      ],
    };
    const marker = createRootBlock(
      'extension-1',
      ['extension-1', 'node-1', 'node-2'],
      510,
      320,
      STORY_CONTINUATION_BLOCK_TYPE,
    );

    expect(
      captureSceneWorkspaceLayout(
        markerScene,
        createWorkspace([marker]),
      ).rootPosition,
    ).toEqual({ x: 510, y: 320 });
  });
});

describe('restoreSceneWorkspaceViewport', () => {
  it('restores zoom before the clamped scroll position', () => {
    const setScale = vi.fn();
    const scroll = vi.fn();
    const workspace = {
      getScale: () => 0.9,
      setScale,
      scroll,
    } as unknown as Blockly.WorkspaceSvg;

    restoreSceneWorkspaceViewport(workspace, {
      rootPosition: { x: 240, y: 180 },
      scale: 1.2,
      scrollX: -140,
      scrollY: -90,
    });

    expect(setScale).toHaveBeenCalledWith(1.2);
    expect(scroll).toHaveBeenCalledWith(-140, -90);
  });
});
