import type {
  AddDialogueAction,
  DeleteDialoguesAction,
  ReorderDialogueAction,
  ReorderDialoguesAction,
  UpdateDialogueAction,
} from '../../hooks/useEngineProject';

import type {
  ProjectDocument,
  SceneDocument,
} from '../../../shared/projectTypes';

import { BlocklyWorkspace } from './BlocklyWorkspace';
import type { BlockEditorLayoutStore } from './blockEditorLayout';

type BlockEditorProps = {
  project: ProjectDocument;
  scene: SceneDocument;
  layoutStore: BlockEditorLayoutStore;
  onSceneChange: (sceneId: string) => void;
  onDialogueUpdate: UpdateDialogueAction;
  onDialogueAdd: AddDialogueAction;
  onDialogueReorder: ReorderDialogueAction;
  onDialoguesReorder: ReorderDialoguesAction;
  onDialogueDelete: DeleteDialoguesAction;
};

export function BlockEditor({
  project,
  scene,
  layoutStore,
  onSceneChange,
  onDialogueAdd,
  onDialogueReorder,
  onDialoguesReorder,
  onDialogueDelete,
  onDialogueUpdate,
}: BlockEditorProps) {
  return (
    <main
      className="block-editor"
      aria-labelledby="block-editor-title"
    >
      <header className="block-editor-heading">
        <div>
          <h1 id="block-editor-title">图形化编辑器</h1>
          <p>
            当前项目：{project.name} · {scene.nodes.length} 条对白
          </p>
        </div>

        <div className="block-editor-heading-controls">
          <label className="block-editor-scene-picker">
            <span>当前场景</span>

            <select
              className="scene-select block-editor-scene-select"
              value={scene.id}
              onChange={(event) =>
                onSceneChange(event.target.value)
              }
            >
              {project.scenes.map((projectScene) => (
                <option
                  key={projectScene.id}
                  value={projectScene.id}
                >
                  {projectScene.name}
                </option>
              ))}
            </select>
          </label>

          <span className="block-editor-sync-badge">
            长按空白框选 · 拖动选择组 · Delete 删除
          </span>
        </div>
      </header>

      <section
        className="block-editor-workspace"
        aria-label="图形化积木工作区"
      >
        <BlocklyWorkspace
          scene={scene}
          layoutKey={`${project.id}:${scene.id}`}
          layoutStore={layoutStore}
          onDialogueAdd={onDialogueAdd}
          onDialogueReorder={onDialogueReorder}
          onDialoguesReorder={onDialoguesReorder}
          onDialogueDelete={onDialogueDelete}
          onDialogueUpdate={onDialogueUpdate}
        />
      </section>
    </main>
  );
}
