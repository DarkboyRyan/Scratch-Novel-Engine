// Renderer 只保存 C++ 返回的项目快照。这里是跨进程 JSON 的 TypeScript
// 形状定义，不创建 ID，也不实现任何项目修改规则。
export type DialogueNode = {
  id: string;
  type: 'dialogue';
  speaker: string;
  text: string;
};

// 未来增加背景、立绘和选项时，可以扩展为多个节点类型的联合类型。
export type SceneNode = DialogueNode;

export type SceneDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  // Renderer 只知道当前背景的资源 ID。图片在磁盘中的相对路径仍由
  // C++/Electron Main 保管，不能从这里拼接本地文件地址。
  backgroundAssetId: string | null;
  nodes: SceneNode[];
};

export type ProjectDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  entrySceneId: string;
  scenes: SceneDocument[];
};

// Renderer receives only UI-safe metadata. Main/C++ keep every absolute and
// project-relative storage path private to the trusted persistence boundary.
export type AssetDocument = {
  id: string;
  type: 'image' | 'video' | 'audio';
  displayName: string;
};
