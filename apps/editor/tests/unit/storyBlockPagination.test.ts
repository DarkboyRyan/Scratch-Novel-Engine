/**
 * 文件主要作用：验证 story Blockly pagination 的行为。
 * 测试覆盖：`story Blockly pagination`。
 */

import type * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';

import {
  isStoryPaginationProjectionConsistent,
  paginateStoryNodes,
} from '../../src/renderer/features/block-editor/storyBlockPagination';
import {
  getSceneStartBlockId,
  SCENE_START_BLOCK_TYPE,
} from '../../src/renderer/features/block-editor/blocks/sceneStartBlock';
import type {
  DialogueNode,
  SceneDocument,
  SceneNode,
} from '../../src/shared/projectTypes';

function dialogue(index: number): DialogueNode {
  return {
    id: `dialogue-${index}`,
    type: 'dialogue',
    speaker: '旁白',
    text: `第 ${index} 句`,
    voiceAssetId: null,
  };
}

function extension(index: number): SceneNode {
  return {
    id: `extension-${index}`,
    type: 'storyExtension',
  };
}

describe('story Blockly pagination', () => {
  it('does not paginate a long timeline without a user extension', () => {
    const nodes = Array.from({ length: 17 }, (_, index) =>
      dialogue(index + 1),
    );

    expect(paginateStoryNodes(nodes)).toEqual([
      { nodes, continuation: null },
    ]);
  });

  it('starts a new page at each persistent extension and sequences it by order', () => {
    const first = extension(1);
    const second = extension(2);
    const nodes: SceneNode[] = [
      dialogue(1),
      dialogue(2),
      first,
      dialogue(3),
      second,
      dialogue(4),
    ];

    expect(paginateStoryNodes(nodes)).toEqual([
      {
        nodes: nodes.slice(0, 2),
        continuation: null,
      },
      {
        nodes: [nodes[3]],
        continuation: { node: first, sequence: 1 },
      },
      {
        nodes: [nodes[5]],
        continuation: { node: second, sequence: 2 },
      },
    ]);
  });

  it('keeps marker-only and trailing-extension pages deterministic', () => {
    const first = extension(1);
    const second = extension(2);
    const nodes: SceneNode[] = [first, second, dialogue(1), extension(3)];

    expect(paginateStoryNodes(nodes)).toEqual([
      { nodes: [], continuation: { node: first, sequence: 1 } },
      {
        nodes: [nodes[2]],
        continuation: { node: second, sequence: 2 },
      },
      { nodes: [], continuation: { node: nodes[3], sequence: 3 } },
    ]);
  });

  it('ends a page at an explicit scene jump without consuming a number', () => {
    const continuation = extension(1);
    const nodes: SceneNode[] = [
      dialogue(1),
      {
        id: 'jump-1',
        type: 'sceneJump',
        targetSceneId: 'scene-2',
      },
      dialogue(2),
      continuation,
      dialogue(3),
    ];

    expect(paginateStoryNodes(nodes)).toEqual([
      { nodes: nodes.slice(0, 2), continuation: null },
      { nodes: [nodes[2]], continuation: null },
      {
        nodes: [nodes[4]],
        continuation: { node: continuation, sequence: 1 },
      },
    ]);
  });

  it('merges adjacent pages after the extension is deleted', () => {
    const marker = extension(1);
    const withExtension: SceneNode[] = [
      dialogue(1),
      dialogue(2),
      marker,
      dialogue(3),
      dialogue(4),
    ];

    expect(paginateStoryNodes(withExtension)).toEqual([
      {
        nodes: withExtension.slice(0, 2),
        continuation: null,
      },
      {
        nodes: withExtension.slice(3),
        continuation: { node: marker, sequence: 1 },
      },
    ]);

    const afterDelete = withExtension.filter(
      (node) => node.type !== 'storyExtension',
    );
    expect(paginateStoryNodes(afterDelete)).toEqual([
      { nodes: afterDelete, continuation: null },
    ]);
  });

  it('keeps a CG root and its dialogue body together while hiding the end marker', () => {
    const nodes: SceneNode[] = [
      dialogue(1),
      {
        id: 'cg-1',
        type: 'cgDisplay',
        assetId: 'cg-image',
        leadInMs: 500,
      },
      {
        ...dialogue(2),
        id: 'cg-line',
      },
      {
        id: 'cg-end-1',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-1',
      },
      extension(1),
      dialogue(3),
    ];

    expect(paginateStoryNodes(nodes)).toEqual([
      {
        nodes: [nodes[0], nodes[1], nodes[2]],
        continuation: null,
      },
      {
        nodes: [nodes[5]],
        continuation: { node: nodes[4], sequence: 1 },
      },
    ]);
  });

  it('treats the fixed scene start block as the previous block of page one', () => {
    const scene: SceneDocument = {
      schemaVersion: 1,
      id: 'scene-with-start',
      name: '带开始节点的场景',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [dialogue(1), dialogue(2)],
    };
    const startId = getSceneStartBlockId(scene.id);
    const links = new Map([
      [startId, { previous: null, next: 'dialogue-1' }],
      ['dialogue-1', { previous: startId, next: 'dialogue-2' }],
      ['dialogue-2', { previous: 'dialogue-1', next: null }],
    ]);
    const blocks = new Map(
      [...links].map(([id, link]) => [
        id,
        {
          id,
          type: id === startId ? SCENE_START_BLOCK_TYPE : 'vn_dialogue',
          getPreviousBlock: () =>
            link.previous ? { id: link.previous } : null,
          getNextBlock: () => (link.next ? { id: link.next } : null),
        },
      ]),
    );
    const workspace = {
      getBlockById: (id: string) => blocks.get(id) ?? null,
    } as unknown as Blockly.WorkspaceSvg;

    expect(
      isStoryPaginationProjectionConsistent(scene, workspace),
    ).toBe(true);

    const firstDialogueLink = links.get('dialogue-1');
    if (!firstDialogueLink) {
      throw new Error('missing test dialogue link');
    }
    firstDialogueLink.previous = null;
    expect(
      isStoryPaginationProjectionConsistent(scene, workspace),
    ).toBe(false);
  });
});
