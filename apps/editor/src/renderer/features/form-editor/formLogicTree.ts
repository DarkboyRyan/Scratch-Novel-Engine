/**
 * 文件主要作用：把逻辑时间线节点转换为表单编辑器可展示的树结构。
 * 包含实现：`FormLogicTreeEntry`、`createFormLogicTree`、`createFormNodeMovePlans`、`getFormNodeMovePlan`、`getCharacterInsertionPlan`。
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

export type FormNodeMovePlan = {
  kind: 'timeline' | 'logicControl' | 'cgDisplay';
  beforeNodeId: string | null;
};

export type FormNodeMovePlans = {
  up: FormNodeMovePlan | null;
  down: FormNodeMovePlan | null;
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

function isFormVisibleItem(item: LogicStructureItem): boolean {
  return item.kind !== 'node' || item.node.type !== 'storyExtension';
}

function moveKindForItem(
  item: LogicStructureItem,
): FormNodeMovePlan['kind'] {
  if (item.kind === 'cg') {
    return 'cgDisplay';
  }
  if (item.kind === 'if' || item.kind === 'repeat') {
    return 'logicControl';
  }
  return 'timeline';
}

function createMovePlan(
  item: LogicStructureItem,
  beforeNodeId: string | null,
): FormNodeMovePlan {
  return {
    kind: moveKindForItem(item),
    beforeNodeId,
  };
}

function appendFormNodeMovePlans(
  plans: Map<string, FormNodeMovePlans>,
  items: LogicStructureItem[],
  branchEndNodeId: string | null,
): void {
  // Arrows reorder one sibling at a time inside the current branch. Paired
  // markers are not visible rows, but remain the insertion anchor after the
  // final sibling so a leaf cannot accidentally escape its owning control.
  const visibleItems = items.flatMap((item, rawIndex) =>
    isFormVisibleItem(item) ? [{ item, rawIndex }] : [],
  );
  visibleItems.forEach(({ item }, index) => {
    const previous = visibleItems[index - 1]?.item;
    const next = visibleItems[index + 1];
    // Down means inserting after the next visible sibling. Use the item that
    // immediately follows that sibling in the original structure, including
    // an invisible StoryExtension, so a one-step move cannot silently cross a
    // page boundary.
    const afterNext = next ? items[next.rawIndex + 1] : undefined;
    plans.set(item.node.id, {
      up: previous ? createMovePlan(item, previous.node.id) : null,
      down: next
        ? createMovePlan(
            item,
            afterNext?.node.id ?? branchEndNodeId,
          )
        : null,
    });
  });

  for (const item of items) {
    if (item.kind === 'node') {
      continue;
    }
    if (item.kind === 'if') {
      appendFormNodeMovePlans(
        plans,
        item.thenItems,
        item.elseNode.id,
      );
      appendFormNodeMovePlans(
        plans,
        item.elseItems,
        item.endNode.id,
      );
      continue;
    }

    appendFormNodeMovePlans(
      plans,
      item.bodyItems,
      item.endNode.id,
    );
  }
}

// Form 列表隐藏 Else/End 标记，也不显示分页用的 StoryExtension。
// 移动计划因此必须由结构树生成，不能用扁平可见列表猜测原始锚点。
export function createFormNodeMovePlans(
  scene: SceneDocument,
): ReadonlyMap<string, FormNodeMovePlans> {
  const plans = new Map<string, FormNodeMovePlans>();
  appendFormNodeMovePlans(plans, parseLogicStructure(scene), null);
  return plans;
}

export function getFormNodeMovePlan(
  scene: SceneDocument,
  nodeId: string,
  direction: -1 | 1,
): FormNodeMovePlan | null {
  const plans = createFormNodeMovePlans(scene).get(nodeId);
  return direction === -1 ? (plans?.up ?? null) : (plans?.down ?? null);
}

export type CharacterInsertionPlan = {
  afterNodeId: string | null;
};

function findCharacterInsertionPlan(
  items: LogicStructureItem[],
  selectedNodeId: string,
): CharacterInsertionPlan | null {
  for (const [index, item] of items.entries()) {
    if (item.kind === 'node') {
      if (item.node.id !== selectedNodeId) {
        continue;
      }

      // Repeated “+立绘” clicks append to the current consecutive
      // portrait group while remaining inside the same structural branch.
      let anchorNodeId = item.node.id;
      if (item.node.type === 'character') {
        let nextIndex = index + 1;
        while (
          items[nextIndex]?.kind === 'node' &&
          items[nextIndex].node.type === 'character'
        ) {
          anchorNodeId = items[nextIndex].node.id;
          nextIndex += 1;
        }
      }
      return {
        afterNodeId: anchorNodeId,
      };
    }

    if (item.node.id === selectedNodeId) {
      return { afterNodeId: item.endNode.id };
    }

    if (item.kind === 'if') {
      const thenResult = findCharacterInsertionPlan(
        item.thenItems,
        selectedNodeId,
      );
      if (thenResult) {
        return thenResult;
      }
      const elseResult = findCharacterInsertionPlan(
        item.elseItems,
        selectedNodeId,
      );
      if (elseResult) {
        return elseResult;
      }
    } else if (item.kind === 'repeat') {
      const bodyResult = findCharacterInsertionPlan(
        item.bodyItems,
        selectedNodeId,
      );
      if (bodyResult) {
        return bodyResult;
      }
    } else if (
      item.bodyItems.some(
        (bodyItem) => bodyItem.node.id === selectedNodeId,
      )
    ) {
      // A CG body only accepts dialogues. Its hidden end marker is therefore
      // the nearest valid “below this row” anchor for a portrait.
      return { afterNodeId: item.endNode.id };
    }
  }
  return null;
}

// Form 的“+立绘”统一使用 after anchor：普通节点放在自身下方，
// 连续立绘追加在组尾，成对控制和 CG 则放在隐藏结束标记后。
// 返回 null 代表非空选择已过期，调用方必须中止，不得降级为末尾追加。
export function getCharacterInsertionPlan(
  scene: SceneDocument,
  selectedNodeId: string | null,
): CharacterInsertionPlan | null {
  if (selectedNodeId === null) {
    return { afterNodeId: null };
  }
  return findCharacterInsertionPlan(
    parseLogicStructure(scene),
    selectedNodeId,
  );
}
