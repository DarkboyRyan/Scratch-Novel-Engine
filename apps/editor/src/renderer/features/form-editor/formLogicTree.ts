/**
 * 文件主要作用：把逻辑时间线节点转换为表单编辑器可展示的树结构。
 * 包含实现：`FormLogicTreeEntry`、`createFormLogicTree`、`getCharacterGroupDialogueAnchorId`。
 */

import type {
  FormVisibleSceneNode,
  SceneDocument,
} from '../../../shared/projectTypes';
import {
  parseLogicStructure,
  type LogicStructureItem,
} from '../block-editor/logicStructure';

export type FormLogicTreeEntry =
  | {
      kind: 'node';
      node: FormVisibleSceneNode;
      depth: number;
      branch: 'root' | 'then' | 'else' | 'body' | 'cgBody';
    }
  | {
      kind: 'branch';
      id: string;
      branch: 'then' | 'else' | 'body' | 'cgBody';
      depth: number;
    };

function appendItems(
  entries: FormLogicTreeEntry[],
  items: LogicStructureItem[],
  depth: number,
  branch: FormLogicTreeEntry['branch'],
): void {
  for (const item of items) {
    if (item.kind === 'node') {
      if (item.node.type !== 'storyExtension') {
        entries.push({
          kind: 'node',
          node: item.node,
          depth,
          branch: branch === 'root' ? 'root' : branch,
        });
      }
      continue;
    }

    entries.push({
      kind: 'node',
      node: item.node,
      depth,
      branch: branch === 'root' ? 'root' : branch,
    });
    if (item.kind === 'if') {
      entries.push({
        kind: 'branch',
        id: `${item.node.id}:then`,
        branch: 'then',
        depth: depth + 1,
      });
      appendItems(entries, item.thenItems, depth + 1, 'then');
      entries.push({
        kind: 'branch',
        id: `${item.node.id}:else`,
        branch: 'else',
        depth: depth + 1,
      });
      appendItems(entries, item.elseItems, depth + 1, 'else');
    } else if (item.kind === 'repeat') {
      entries.push({
        kind: 'branch',
        id: `${item.node.id}:body`,
        branch: 'body',
        depth: depth + 1,
      });
      appendItems(entries, item.bodyItems, depth + 1, 'body');
    } else {
      entries.push({
        kind: 'branch',
        id: `${item.node.id}:cg-body`,
        branch: 'cgBody',
        depth: depth + 1,
      });
      appendItems(entries, item.bodyItems, depth + 1, 'cgBody');
    }
  }
}

export function createFormLogicTree(
  scene: SceneDocument,
): FormLogicTreeEntry[] {
  const entries: FormLogicTreeEntry[] = [];
  appendItems(entries, parseLogicStructure(scene), 0, 'root');
  return entries;
}

type CharacterGroupAnchorSearch = {
  dialogueNodeId: string | null;
};

function findCharacterGroupDialogueAnchor(
  items: LogicStructureItem[],
  characterNodeId: string,
): CharacterGroupAnchorSearch | null {
  for (const [index, item] of items.entries()) {
    if (item.kind === 'node' && item.node.id === characterNodeId) {
      let nextIndex = index + 1;
      while (
        items[nextIndex]?.kind === 'node' &&
        items[nextIndex].node.type === 'character'
      ) {
        nextIndex += 1;
      }
      const nextItem = items[nextIndex];
      return {
        dialogueNodeId:
          nextItem?.kind === 'node' && nextItem.node.type === 'dialogue'
            ? nextItem.node.id
            : null,
      };
    }

    if (item.kind === 'if') {
      const thenResult = findCharacterGroupDialogueAnchor(
        item.thenItems,
        characterNodeId,
      );
      if (thenResult) {
        return thenResult;
      }
      const elseResult = findCharacterGroupDialogueAnchor(
        item.elseItems,
        characterNodeId,
      );
      if (elseResult) {
        return elseResult;
      }
    } else if (item.kind === 'repeat' || item.kind === 'cg') {
      const bodyResult = findCharacterGroupDialogueAnchor(
        item.bodyItems,
        characterNodeId,
      );
      if (bodyResult) {
        return bodyResult;
      }
    }
  }
  return null;
}

// “+立绘”只把连续立绘归入同一结构分支中的下一条对白。
// Else/End marker 虽不在表单列表中，也必须继续充当分支边界；
// 嵌套控制项同样会中断连续立绘组。
export function getCharacterGroupDialogueAnchorId(
  scene: SceneDocument,
  characterNodeId: string,
): string | null {
  return findCharacterGroupDialogueAnchor(
    parseLogicStructure(scene),
    characterNodeId,
  )?.dialogueNodeId ?? null;
}
