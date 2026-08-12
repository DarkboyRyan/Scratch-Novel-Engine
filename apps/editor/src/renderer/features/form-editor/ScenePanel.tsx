import type {
  DialogueNode,
  ProjectDocument,
  SceneDocument,
} from '../../../shared/projectTypes';

type ScenePanelProps = {
  project: ProjectDocument;
  scene: SceneDocument;
  selectedNodeId: string | null;
  isBusy: boolean;
  onAddScene: () => Promise<void>;
  onSelectScene: (sceneId: string) => void;
  onSelectNode: (node: DialogueNode) => void;
  onMoveDialogue: (
    nodeId: string,
    direction: -1 | 1,
  ) => Promise<void>;
  onDeleteDialogue: (nodeId: string) => Promise<void>;
};

export function ScenePanel({
  project,
  scene,
  selectedNodeId,
  isBusy,
  onAddScene,
  onSelectScene,
  onSelectNode,
  onMoveDialogue,
  onDeleteDialogue,
}: ScenePanelProps) {
  return (
    <aside className="panel scene-panel">
      <div className="scene-switcher">
        <button
          type="button"
          className="add-button"
          aria-label="新建场景"
          title="新建空场景"
          disabled={isBusy}
          onClick={() => void onAddScene()}
        >
          <span aria-hidden="true">+</span>
        </button>

        <select
          className="scene-select"
          aria-label="选择当前场景"
          value={scene.id}
          disabled={isBusy}
          onChange={(event) => onSelectScene(event.target.value)}
        >
          {project.scenes.map((projectScene) => (
            <option key={projectScene.id} value={projectScene.id}>
              {projectScene.name}
            </option>
          ))}
        </select>

      </div>

      <div className="scene-status">
        <span>{project.scenes.length} 个场景</span>
        <span>{scene.nodes.length} 条目</span>
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
              onClick={() => onSelectNode(dialogue)}
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
                disabled={isBusy || index === 0}
                aria-label={`上移 ${dialogue.speaker} 的对白`}
                title="上移"
                onClick={() =>
                  void onMoveDialogue(dialogue.id, -1)
                }
              >
                ↑
              </button>

              <button
                type="button"
                className="dialogue-move-button"
                disabled={
                  isBusy || index === scene.nodes.length - 1
                }
                aria-label={`下移 ${dialogue.speaker} 的对白`}
                title="下移"
                onClick={() =>
                  void onMoveDialogue(dialogue.id, 1)
                }
              >
                ↓
              </button>

              <button
                type="button"
                className="dialogue-delete-button"
                aria-label={`删除 ${dialogue.speaker} 的对白`}
                title="删除这条对白"
                disabled={isBusy}
                onClick={() =>
                  void onDeleteDialogue(dialogue.id)
                }
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
