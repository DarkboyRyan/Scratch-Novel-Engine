import { useReducer, useState, type FormEvent } from 'react';

import {
  createEmptyScene,
  type DialogueNode,
} from './model/scene';
import { sceneReducer } from './state/sceneReducer';

const initialScene = createEmptyScene();

export default function App() {
  // useReducer 把“当前场景”和“场景如何变化”连接起来。
  // App 只 dispatch 用户意图，具体数组操作由 sceneReducer 负责。
  const [scene, dispatchScene] = useReducer(
    sceneReducer,
    initialScene,
  );

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

  function handleInsertEmptyDialogue() {
    // “+” 是场景结构操作：点击后立即创建一个真实的空节点。
    const newDialogue: DialogueNode = {
      id: crypto.randomUUID(),
      type: 'dialogue',
      speaker: '',
      text: '',
    };

    dispatchScene({
      type: 'dialogue/add',
      node: newDialogue,
      // 有选中节点时插在它后面；没有选中节点时 Reducer 会追加到末尾。
      afterNodeId: selectedNodeId,
    });

    // 自动选中新节点，让右侧 Inspector 可以立即填写它。
    handleSelectNode(newDialogue);
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
      dispatchScene({
        type: 'dialogue/update',
        nodeId: selectedNode.id,
        speaker: normalizedSpeaker,
        text: trimmedText,
      });

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

    dispatchScene({
      type: 'dialogue/add',
      node: newDialogue,
    });

    // 新增完成后返回新建模式，清空表单以便连续录入下一句对白。
    // 已创建的节点仍保留在左侧列表，需要修改时再点击该节点。
    handleStartNewDialogue();
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

    dispatchScene({
      type: 'node/delete',
      nodeId,
    });

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

  function handleMoveDialogue(
    nodeId: string,
    direction: -1 | 1,
  ) {
    dispatchScene({
      type: 'node/move',
      nodeId,
      direction,
    });
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
            aria-label="在当前节点后插入空对白"
            title="在当前节点后插入空对白"
            onClick={handleInsertEmptyDialogue}
          >
            +
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

              <div className="dialogue-item-actions">
                <button
                  type="button"
                  className="dialogue-move-button"
                  disabled={index === 0}
                  aria-label={`上移 ${dialogue.speaker} 的对白`}
                  title="上移"
                  onClick={() =>
                    handleMoveDialogue(dialogue.id, -1)
                  }
                >
                  ↑
                </button>

                <button
                  type="button"
                  className="dialogue-move-button"
                  disabled={index === scene.nodes.length - 1}
                  aria-label={`下移 ${dialogue.speaker} 的对白`}
                  title="下移"
                  onClick={() =>
                    handleMoveDialogue(dialogue.id, 1)
                  }
                >
                  ↓
                </button>

                <button
                  type="button"
                  className="dialogue-delete-button"
                  aria-label={`删除 ${dialogue.speaker} 的对白`}
                  title="删除这条对白"
                  onClick={() =>
                    handleDeleteDialogue(dialogue.id)
                  }
                >
                  删除
                </button>
              </div>
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
          <h2>{selectedNode ? '编辑对白' : '对话管理'}</h2>
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
