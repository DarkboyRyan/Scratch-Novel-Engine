import type {
  DialogueNode,
  SceneDocument,
} from '../model/scene';

// Action 描述“用户想做什么”，而不是界面应该怎样修改数组。
// 以后实现 Undo/Redo 时，也可以把这些 Action 记录到历史中。
export type SceneAction =
  | { type: 'dialogue/add'; node: DialogueNode }
  | {
      type: 'dialogue/update';
      nodeId: string;
      speaker: string;
      text: string;
    }
  | { type: 'node/delete'; nodeId: string }
  | {
      type: 'node/move';
      nodeId: string;
      direction: -1 | 1;
    };

// Reducer 是纯业务函数：相同的 state 和 action 总会得到相同结果。
// 它不读取输入框、不显示确认弹窗，也不调用 Electron 文件系统。
export function sceneReducer(
  state: SceneDocument,
  action: SceneAction,
): SceneDocument {
  switch (action.type) {
    case 'dialogue/add':
      return {
        ...state,
        nodes: [...state.nodes, action.node],
      };

    case 'dialogue/update':
      return {
        ...state,
        // map 保留数组顺序，只替换 ID 匹配的节点。
        nodes: state.nodes.map((node) =>
          node.id === action.nodeId
            ? {
                ...node,
                speaker: action.speaker,
                text: action.text,
              }
            : node,
        ),
      };

    case 'node/delete':
      return {
        ...state,
        // filter 创建一个不包含目标节点的新数组。
        nodes: state.nodes.filter(
          (node) => node.id !== action.nodeId,
        ),
      };
    case 'node/move': {
      const currentIndex = state.nodes.findIndex(
        (node) => node.id === action.nodeId,
      );
      const targetIndex = currentIndex + action.direction;

      const cannotMove =
        currentIndex === -1 ||
        targetIndex < 0 ||
        targetIndex >= state.nodes.length;

      if (cannotMove) {
        return state;
      }

      const nextNodes = [...state.nodes];

      [nextNodes[currentIndex], nextNodes[targetIndex]] = [
        nextNodes[targetIndex],
        nextNodes[currentIndex],
      ];

      return {
        ...state,
        nodes: nextNodes,
      };
    }

    default: {
      // 如果未来新增 Action 却忘记处理，TypeScript 会在这里提示。
      const unhandledAction: never = action;
      return unhandledAction;
    }
  }
}
