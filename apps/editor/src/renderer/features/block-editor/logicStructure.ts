import type {
  LogicElseNode,
  LogicEndIfNode,
  LogicEndRepeatNode,
  LogicIfNode,
  LogicRepeatNode,
  SceneDocument,
  SceneNode,
} from '../../../shared/projectTypes';

type HiddenLogicMarker =
  | LogicElseNode
  | LogicEndIfNode
  | LogicEndRepeatNode;

export type VisibleLeafNode = Exclude<
  SceneNode,
  HiddenLogicMarker | LogicIfNode | LogicRepeatNode
>;

export type LogicStructureItem =
  | {
      kind: 'node';
      node: VisibleLeafNode;
    }
  | {
      kind: 'if';
      node: LogicIfNode;
      elseNode: LogicElseNode;
      endNode: LogicEndIfNode;
      thenItems: LogicStructureItem[];
      elseItems: LogicStructureItem[];
    }
  | {
      kind: 'repeat';
      node: LogicRepeatNode;
      endNode: LogicEndRepeatNode;
      bodyItems: LogicStructureItem[];
    };

type ParseStop =
  | {
      type: 'logicElse' | 'logicEndIf';
      ownerId: string;
    }
  | {
      type: 'logicEndRepeat';
      ownerId: string;
    }
  | null;

type ParseResult = {
  items: LogicStructureItem[];
  nextIndex: number;
};

function markerOwnerMatches(node: SceneNode, stop: ParseStop): boolean {
  if (!stop || node.type !== stop.type) {
    return false;
  }
  return node.type === 'logicEndRepeat'
    ? node.repeatNodeId === stop.ownerId
    : node.ifNodeId === stop.ownerId;
}

function parseItems(
  nodes: SceneNode[],
  startIndex: number,
  stop: ParseStop,
  depth: number,
): ParseResult {
  if (depth > 16) {
    throw new Error('逻辑积木嵌套超过 16 层');
  }

  const items: LogicStructureItem[] = [];
  let index = startIndex;

  while (index < nodes.length) {
    const node = nodes[index];
    if (markerOwnerMatches(node, stop)) {
      return { items, nextIndex: index };
    }

    if (
      node.type === 'logicElse' ||
      node.type === 'logicEndIf' ||
      node.type === 'logicEndRepeat'
    ) {
      throw new Error(`逻辑控制标记不匹配：${node.id}`);
    }

    if (node.type === 'storyExtension' && depth > 0) {
      throw new Error(`延伸积木不能放入逻辑积木：${node.id}`);
    }

    if (node.type === 'logicIf') {
      const thenResult = parseItems(
        nodes,
        index + 1,
        { type: 'logicElse', ownerId: node.id },
        depth + 1,
      );
      const elseNode = nodes[thenResult.nextIndex];
      if (
        !elseNode ||
        elseNode.type !== 'logicElse' ||
        elseNode.ifNodeId !== node.id
      ) {
        throw new Error(`If 积木缺少 Else 标记：${node.id}`);
      }
      const elseResult = parseItems(
        nodes,
        thenResult.nextIndex + 1,
        { type: 'logicEndIf', ownerId: node.id },
        depth + 1,
      );
      const endNode = nodes[elseResult.nextIndex];
      if (
        !endNode ||
        endNode.type !== 'logicEndIf' ||
        endNode.ifNodeId !== node.id
      ) {
        throw new Error(`If 积木缺少 EndIf 标记：${node.id}`);
      }
      items.push({
        kind: 'if',
        node,
        elseNode,
        endNode,
        thenItems: thenResult.items,
        elseItems: elseResult.items,
      });
      index = elseResult.nextIndex + 1;
      continue;
    }

    if (node.type === 'logicRepeat') {
      const bodyResult = parseItems(
        nodes,
        index + 1,
        { type: 'logicEndRepeat', ownerId: node.id },
        depth + 1,
      );
      const endNode = nodes[bodyResult.nextIndex];
      if (
        !endNode ||
        endNode.type !== 'logicEndRepeat' ||
        endNode.repeatNodeId !== node.id
      ) {
        throw new Error(`Repeat 积木缺少结束标记：${node.id}`);
      }
      items.push({
        kind: 'repeat',
        node,
        endNode,
        bodyItems: bodyResult.items,
      });
      index = bodyResult.nextIndex + 1;
      continue;
    }

    items.push({ kind: 'node', node });
    index += 1;
  }

  if (stop) {
    throw new Error(`逻辑控制结构未结束：${stop.ownerId}`);
  }
  return { items, nextIndex: index };
}

export function parseLogicStructure(
  scene: Pick<SceneDocument, 'nodes'>,
): LogicStructureItem[] {
  return parseItems(scene.nodes, 0, null, 0).items;
}

export function flattenLogicStructure(
  items: LogicStructureItem[],
): SceneNode[] {
  return items.flatMap((item): SceneNode[] => {
    if (item.kind === 'node') {
      return [item.node];
    }
    if (item.kind === 'if') {
      return [
        item.node,
        ...flattenLogicStructure(item.thenItems),
        item.elseNode,
        ...flattenLogicStructure(item.elseItems),
        item.endNode,
      ];
    }
    return [
      item.node,
      ...flattenLogicStructure(item.bodyItems),
      item.endNode,
    ];
  });
}

export function findLogicControlItem(
  items: LogicStructureItem[],
  nodeId: string,
): Extract<LogicStructureItem, { kind: 'if' | 'repeat' }> | null {
  for (const item of items) {
    if (item.kind === 'node') {
      continue;
    }
    if (item.node.id === nodeId) {
      return item;
    }
    const nested = findLogicControlItem(
      item.kind === 'if'
        ? [...item.thenItems, ...item.elseItems]
        : item.bodyItems,
      nodeId,
    );
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function getLogicControlNodeIds(
  scene: Pick<SceneDocument, 'nodes'>,
  nodeId: string,
): string[] {
  const item = findLogicControlItem(parseLogicStructure(scene), nodeId);
  return item ? flattenLogicStructure([item]).map((node) => node.id) : [];
}
