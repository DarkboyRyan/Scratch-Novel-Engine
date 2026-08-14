// Renderer 只保存 C++ 返回的项目快照。这里是跨进程 JSON 的 TypeScript
// 形状定义，不创建 ID，也不实现任何项目修改规则。
export type DialogueNode = {
  id: string;
  type: 'dialogue';
  speaker: string;
  text: string;
  // null means this dialogue has no one-shot voice clip.
  voiceAssetId: string | null;
};

// 背景节点属于有顺序的剧情时间线：播放到这里时切换背景，并持续到
// 下一个背景节点。它只保存资源 ID，不暴露图片的本地路径。
export type BackgroundNode = {
  id: string;
  type: 'background';
  // null 是真实的“从这里开始无背景”时间线指令。
  assetId: string | null;
};

export type CharacterSlot = 'left' | 'center' | 'right';

// 立绘节点也是时间线指令。assetId 为 null 表示从这里开始清空指定层；
// layer 越大越靠前，但仍始终位于对白框下方。
export type CharacterNode = {
  id: string;
  type: 'character';
  assetId: string | null;
  slot: CharacterSlot;
  layer: number;
};

export type SceneJumpNode = {
  id: string;
  type: 'sceneJump';
  targetSceneId: string;
};

// BGM is a persistent timeline command. null explicitly stops the current
// track; otherwise the referenced audio loops until another BGM node.
export type BgmNode = {
  id: string;
  type: 'bgm';
  assetId: string | null;
};

// A video node pauses the ordinary story presentation while its referenced
// clip plays. When playback reaches the end, preview resumes at the following
// timeline node. null is an unassigned editor slot, not a host file path.
export type VideoNode = {
  id: string;
  type: 'video';
  assetId: string | null;
};

// A choice pauses formal preview and presents all options together. Each
// option owns a stable C++ ID so nested Blockly edits and reordering remain
// authoritative across complete project snapshots.
export type ChoiceOption = {
  id: string;
  text: string;
  targetSceneId: string;
};

export type ChoiceNode = {
  id: string;
  type: 'choice';
  options: ChoiceOption[];
};

// type 是跨 C++ / Electron / Renderer 的判别字段。使用联合类型后，消费方
// 必须先检查 node.type，避免把背景节点误当成可编辑对白。
export type SceneNode =
  | DialogueNode
  | BackgroundNode
  | CharacterNode
  | SceneJumpNode
  | BgmNode
  | VideoNode
  | ChoiceNode;

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
