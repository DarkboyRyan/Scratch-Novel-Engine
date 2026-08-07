import { useState, type FormEvent } from 'react';

// SceneDocument 中的每一个剧情条目都是一个节点。
// 目前先支持 dialogue，之后可以扩展 background、choice、jump 等类型。
type DialogueNode = {
  id: string;
  type: 'dialogue';
  speaker: string;
  text: string;
};

// 一个场景包含场景信息和按顺序排列的剧情节点。
// schemaVersion 会在未来 JSON 数据结构升级时用于迁移旧项目。
type SceneDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  nodes: DialogueNode[];
};

export default function App() {
  // scene 是当前正在编辑的场景，也是之后保存成 JSON 的核心数据。
  const [scene, setScene] = useState<SceneDocument>({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: '场景 1',
    nodes: [],
  });

  // 这里只保存选中节点的 ID，不复制整个节点，避免产生两份不同步的数据。
  // null 代表右侧表单处于“新建模式”，有 ID 则代表“编辑模式”。
  const [selectedNodeId, setSelectedNodeId] =
    useState<string | null>(null);

  // speaker 和 text 是右侧表单当前正在编辑的草稿。
  const [speaker, setSpeaker] = useState('');
  const [text, setText] = useState('');

  // selectedNode 是派生数据：它可以通过 scene 和 selectedNodeId 计算出来，
  // 因此不需要另建 useState，否则容易和 scene 中的节点不同步。
  const selectedNode = scene.nodes.find(
    (node) => node.id === selectedNodeId,
  );

  // 表单本身就是预览区的数据来源，所以输入时能够立即看到变化。
  const previewSpeaker = speaker.trim();
  const previewText = text;

  function handleSelectNode(node: DialogueNode) {
    setSelectedNodeId(node.id);

    // 点击左侧条目时，把节点内容载入右侧表单。
    setSpeaker(node.speaker);
    setText(node.text);
  }

  function handleStartNewDialogue() {
    // 清除选中状态和表单内容，切换回“新建模式”。
    setSelectedNodeId(null);
    setSpeaker('');
    setText('');
  }

  function handleSubmitDialogue(event: FormEvent<HTMLFormElement>) {
    // HTML 表单默认会刷新页面；Electron 编辑器只需要更新 React 状态。
    event.preventDefault();

    const trimmedText = text.trim();

    // 不允许加入或保存只有空格的对白。
    if (!trimmedText) {
      return;
    }

    const normalizedSpeaker = speaker.trim() || '旁白';

    if (selectedNode) {
      // 编辑已有节点时用 map 创建新数组，只替换 ID 匹配的节点。
      // 其他节点保持原来的顺序和内容。
      setScene((currentScene) => ({
        ...currentScene,
        nodes: currentScene.nodes.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                speaker: normalizedSpeaker,
                text: trimmedText,
              }
            : node,
        ),
      }));

      setSpeaker(normalizedSpeaker);
      setText(trimmedText);
      return;
    }

    const newDialogue: DialogueNode = {
      id: crypto.randomUUID(),
      type: 'dialogue',
      speaker: normalizedSpeaker,
      text: trimmedText,
    };

    // 新建节点时也不直接 push，而是创建新的 scene 和 nodes 数组。
    setScene((currentScene) => ({
      ...currentScene,
      nodes: [...currentScene.nodes, newDialogue],
    }));

    // 新增完成后自动进入该节点的编辑模式。
    setSelectedNodeId(newDialogue.id);
    setSpeaker(newDialogue.speaker);
    setText(newDialogue.text);
  }

  function handleDeleteDialogue(nodeId: string) {
    // 删除按钮属于具体的列表项，所以通过 nodeId 找到要删除的节点，
    // 而不是假设用户一定在删除当前选中的节点。
    const nodeToDelete = scene.nodes.find(
      (node) => node.id === nodeId,
    );

    if (!nodeToDelete) {
      return;
    }

    // 还没有 Undo 功能，所以删除前先让用户确认。
    const shouldDelete = window.confirm(
      `确定删除 ${nodeToDelete.speaker} 的这条对白吗？`,
    );

    if (!shouldDelete) {
      return;
    }

    const selectedIndex = scene.nodes.findIndex(
      (node) => node.id === nodeId,
    );

    // filter 会返回一个不包含被删除节点的新数组。
    const remainingNodes = scene.nodes.filter(
      (node) => node.id !== nodeId,
    );

    setScene((currentScene) => ({
      ...currentScene,
      nodes: remainingNodes,
    }));

    // 删除的不是当前选中节点时，右侧编辑状态应该保持不变。
    if (nodeId !== selectedNodeId) {
      return;
    }

    // 优先选择删除位置后面的节点；如果没有，就选择前一个节点。
    const nextNode =
      remainingNodes[selectedIndex] ??
      remainingNodes[selectedIndex - 1];

    if (nextNode) {
      handleSelectNode(nextNode);
    } else {
      handleStartNewDialogue();
    }
  }

  return (
    <div className="editor">
      <header className="toolbar">
        <strong>VN Engine Editor</strong>
        <span>Project: Untitled</span>
      </header>

      <aside className="panel scene-panel">
        <div className="panel-heading">
          <div className="scene-title">
            <h2>{scene.name}</h2>
            <span>{scene.nodes.length} 条目</span>
          </div>

          <button
            type="button"
            className="scene-add-dialogue-button"
            onClick={handleStartNewDialogue}
          >
            新建对白
          </button>
        </div>

        <ol className="dialogue-list">
          {scene.nodes.map((dialogue, index) => (
            <li
              key={dialogue.id}
              className={
                dialogue.id === selectedNodeId ? 'selected' : ''
              }
            >
              <button
                type="button"
                className="dialogue-list-item"
                onClick={() => handleSelectNode(dialogue)}
              >
                <span className="dialogue-number">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <div>
                  <strong>{dialogue.speaker}</strong>
                  <p>{dialogue.text}</p>
                </div>
              </button>

              <button
                type="button"
                className="dialogue-delete-button"
                aria-label={`删除 ${dialogue.speaker} 的对白`}
                title="删除这条对白"
                onClick={() => handleDeleteDialogue(dialogue.id)}
              >
                删除
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <main className="preview-panel">
        <div className="preview-stage">
          <p className="preview-placeholder">预览界面</p>

          <div className="dialogue-box">
            <strong>{previewSpeaker}</strong>
            <p>{previewText}</p>
          </div>
        </div>
      </main>

      <aside className="panel inspector-panel">
        <div className="panel-heading">
          <h2>{selectedNode ? '编辑对白' : '新建对白'}</h2>
        </div>

        <form onSubmit={handleSubmitDialogue}>
          <label>
            角色名
            <input
              value={speaker}
              onChange={(event) => setSpeaker(event.target.value)}
              placeholder="例如：Alice"
            />
          </label>

          <label>
            具体文本
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="输入对白内容……"
              rows={7}
            />
          </label>

          <button type="submit">
            {selectedNode ? '保存修改' : '加入剧情'}
          </button>
        </form>
      </aside>
    </div>
  );
}
