import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import type {
  AddBackgroundAction,
  AddDialogueAction,
  AddCharacterAction,
  AddSceneJumpAction,
  AddBgmAction,
  AddVideoAction,
  AddChoiceAction,
  AddChoiceOptionAction,
  DeleteChoiceOptionAction,
  DeleteTimelineNodesAction,
  ReorderTimelineNodeAction,
  ReorderTimelineNodesAction,
  UpdateBackgroundAction,
  UpdateDialogueAction,
  UpdateCharacterAction,
  UpdateSceneJumpAction,
  UpdateBgmAction,
  UpdateVideoAction,
  UpdateChoiceOptionAction,
  ReorderChoiceOptionAction,
  SetDialogueVoiceAction,
} from '../../application/authoringPorts';

import type {
  ProjectDocument,
  SceneDocument,
  AssetDocument,
} from '../../../shared/projectTypes';

import {
  BlocklyWorkspace,
  type BlocklyWorkspaceHandle,
} from './BlocklyWorkspace';
import type { BlockEditorLayoutStore } from './blockEditorLayout';

type BlockEditorProps = {
  project: ProjectDocument;
  scene: SceneDocument;
  layoutStore: BlockEditorLayoutStore;
  isBusy: boolean;
  assets: AssetDocument[];
  onSceneChange: (sceneId: string) => Promise<void>;
  onDialogueUpdate: UpdateDialogueAction;
  onDialogueAdd: AddDialogueAction;
  onBackgroundAdd: AddBackgroundAction;
  onBackgroundUpdate: UpdateBackgroundAction;
  onCharacterAdd: AddCharacterAction;
  onCharacterUpdate: UpdateCharacterAction;
  onSceneJumpAdd: AddSceneJumpAction;
  onSceneJumpUpdate: UpdateSceneJumpAction;
  onBgmAdd: AddBgmAction;
  onBgmUpdate: UpdateBgmAction;
  onVideoAdd: AddVideoAction;
  onVideoUpdate: UpdateVideoAction;
  onChoiceAdd: AddChoiceAction;
  onChoiceOptionAdd: AddChoiceOptionAction;
  onChoiceOptionUpdate: UpdateChoiceOptionAction;
  onChoiceOptionDelete: DeleteChoiceOptionAction;
  onChoiceOptionReorder: ReorderChoiceOptionAction;
  onDialogueVoiceUpdate: SetDialogueVoiceAction;
  onTimelineReorder: ReorderTimelineNodeAction;
  onTimelineNodesReorder: ReorderTimelineNodesAction;
  onTimelineNodesDelete: DeleteTimelineNodesAction;
  onDraftDirtyChange: (isDirty: boolean) => void;
};

export type BlockEditorHandle = BlocklyWorkspaceHandle;

export const BlockEditor = forwardRef<
  BlockEditorHandle,
  BlockEditorProps
>(function BlockEditor(
  {
    project,
    scene,
    layoutStore,
    isBusy,
    assets,
    onSceneChange,
    onDialogueAdd,
    onBackgroundAdd,
    onBackgroundUpdate,
    onCharacterAdd,
    onCharacterUpdate,
    onSceneJumpAdd,
    onSceneJumpUpdate,
    onBgmAdd,
    onBgmUpdate,
    onVideoAdd,
    onVideoUpdate,
    onChoiceAdd,
    onChoiceOptionAdd,
    onChoiceOptionUpdate,
    onChoiceOptionDelete,
    onChoiceOptionReorder,
    onDialogueVoiceUpdate,
    onTimelineReorder,
    onTimelineNodesReorder,
    onTimelineNodesDelete,
    onDialogueUpdate,
    onDraftDirtyChange,
  },
  ref,
) {
  const workspaceRef = useRef<BlocklyWorkspaceHandle>(null);
  const [isChangingScene, setIsChangingScene] = useState(false);
  useImperativeHandle(ref, () => ({
    flushPendingDraft: () =>
      workspaceRef.current?.flushPendingDraft() ?? Promise.resolve(true),
  }));

  return (
    <main
      className="block-editor"
      aria-labelledby="block-editor-title"
    >
      <header className="block-editor-heading">
        <div>
          <h1 id="block-editor-title">图形化编辑器</h1>
          <p>
            当前项目：{project.name} · {scene.nodes.length} 个剧情节点
          </p>
        </div>

        <div className="block-editor-heading-controls">
          <label className="block-editor-scene-picker">
            <span>当前场景</span>

            <select
              className="scene-select block-editor-scene-select"
              value={scene.id}
              disabled={isBusy || isChangingScene}
              onChange={(event) => {
                const nextSceneId = event.target.value;
                void (async () => {
                  setIsChangingScene(true);
                  try {
                    const flushed =
                      await (workspaceRef.current?.flushPendingDraft() ??
                        true);
                    if (flushed) {
                      await onSceneChange(nextSceneId);
                    }
                  } finally {
                    setIsChangingScene(false);
                  }
                })();
              }}
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
          ref={workspaceRef}
          scene={scene}
          scenes={project.scenes}
          assets={assets}
          layoutKey={`${project.id}:${scene.id}`}
          layoutStore={layoutStore}
          isBusy={isBusy}
          onDialogueAdd={onDialogueAdd}
          onBackgroundAdd={onBackgroundAdd}
          onBackgroundUpdate={onBackgroundUpdate}
          onCharacterAdd={onCharacterAdd}
          onCharacterUpdate={onCharacterUpdate}
          onSceneJumpAdd={onSceneJumpAdd}
          onSceneJumpUpdate={onSceneJumpUpdate}
          onBgmAdd={onBgmAdd}
          onBgmUpdate={onBgmUpdate}
          onVideoAdd={onVideoAdd}
          onVideoUpdate={onVideoUpdate}
          onChoiceAdd={onChoiceAdd}
          onChoiceOptionAdd={onChoiceOptionAdd}
          onChoiceOptionUpdate={onChoiceOptionUpdate}
          onChoiceOptionDelete={onChoiceOptionDelete}
          onChoiceOptionReorder={onChoiceOptionReorder}
          onDialogueVoiceUpdate={onDialogueVoiceUpdate}
          onTimelineReorder={onTimelineReorder}
          onTimelineNodesReorder={onTimelineNodesReorder}
          onTimelineNodesDelete={onTimelineNodesDelete}
          onDialogueUpdate={onDialogueUpdate}
          onDraftDirtyChange={onDraftDirtyChange}
        />
      </section>
    </main>
  );
});
