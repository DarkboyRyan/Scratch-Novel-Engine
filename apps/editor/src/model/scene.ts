// Model 层只描述视觉小说的数据结构，不依赖 React 组件和 CSS。
export type DialogueNode = {
  id: string;
  type: 'dialogue';
  speaker: string;
  text: string;
};

// 现在 SceneNode 只有 DialogueNode。未来增加背景、立绘和选项时，
// 可以把它扩展成多个节点类型组成的联合类型。
export type SceneNode = DialogueNode;

export type SceneDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  nodes: SceneNode[];
};

// 用工厂函数集中创建默认场景，避免不同组件各自复制一份初始结构。
export function createEmptyScene(): SceneDocument {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: '场景 1',
    nodes: [],
  };
}
