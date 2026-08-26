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
  AddStoryExtensionAction,
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
  AddVariableSetAction,
  UpdateVariableSetAction,
  AddVariableChangeAction,
  UpdateVariableChangeAction,
  AddLogicIfAction,
  UpdateLogicIfAction,
  AddLogicRepeatAction,
  UpdateLogicRepeatAction,
  DeleteLogicControlAction,
  ReorderLogicControlAction,
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
import {
  createEditorSceneOptions,
  CG_GALLERY_SCENE_ID,
  START_SCREEN_SCENE_ID,
} from '../start-screen/startScreenScene';
import { useEditorLabels } from '../../i18n/editorLocalization';

type BlockEditorProps = {
  project: ProjectDocument;
  scene: SceneDocument;
  layoutStore: BlockEditorLayoutStore;
  isBusy: boolean;
  assets: AssetDocument[];
  onSceneChange: (sceneId: string) => Promise<void>;
  onSelectStartScreen: () => Promise<void>;
  onSelectCgGallery: () => Promise<void>;
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
  onStoryExtensionAdd: AddStoryExtensionAction;
  onVariableSetAdd: AddVariableSetAction;
  onVariableSetUpdate: UpdateVariableSetAction;
  onVariableChangeAdd: AddVariableChangeAction;
  onVariableChangeUpdate: UpdateVariableChangeAction;
  onLogicIfAdd: AddLogicIfAction;
  onLogicIfUpdate: UpdateLogicIfAction;
  onLogicRepeatAdd: AddLogicRepeatAction;
  onLogicRepeatUpdate: UpdateLogicRepeatAction;
  onLogicControlDelete: DeleteLogicControlAction;
  onLogicControlReorder: ReorderLogicControlAction;
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
    onSelectStartScreen,
    onSelectCgGallery,
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
    onStoryExtensionAdd,
    onVariableSetAdd,
    onVariableSetUpdate,
    onVariableChangeAdd,
    onVariableChangeUpdate,
    onLogicIfAdd,
    onLogicIfUpdate,
    onLogicRepeatAdd,
    onLogicRepeatUpdate,
    onLogicControlDelete,
    onLogicControlReorder,
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
  const labels = useEditorLabels();
  const workspaceRef = useRef<BlocklyWorkspaceHandle>(null);
  const [isChangingScene, setIsChangingScene] = useState(false);
  const sceneOptions = createEditorSceneOptions(project, labels);
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
          <h1 id="block-editor-title">{labels.blockEditor.title}</h1>
          <p>
            {labels.blockEditor.currentProject}：{project.name} ·{' '}
            {
              scene.nodes.filter(
                (node) => node.type !== 'storyExtension',
              ).length
            }{' '}
            {labels.scenes.storyNodeUnit}
          </p>
        </div>

        <div className="block-editor-heading-controls">
          <label className="block-editor-scene-picker">
            <span>{labels.scenes.currentScene}</span>

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
                      await (nextSceneId === START_SCREEN_SCENE_ID
                        ? onSelectStartScreen()
                        : nextSceneId === CG_GALLERY_SCENE_ID
                          ? onSelectCgGallery()
                          : onSceneChange(nextSceneId));
                    }
                  } finally {
                    setIsChangingScene(false);
                  }
                })();
              }}
            >
              {sceneOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <span className="block-editor-sync-badge">
            {labels.blockEditor.selectionHelp}
          </span>
        </div>
      </header>

      <section
        className="block-editor-workspace"
        aria-label={labels.blockEditor.workspace}
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
          onStoryExtensionAdd={onStoryExtensionAdd}
          onVariableSetAdd={onVariableSetAdd}
          onVariableSetUpdate={onVariableSetUpdate}
          onVariableChangeAdd={onVariableChangeAdd}
          onVariableChangeUpdate={onVariableChangeUpdate}
          onLogicIfAdd={onLogicIfAdd}
          onLogicIfUpdate={onLogicIfUpdate}
          onLogicRepeatAdd={onLogicRepeatAdd}
          onLogicRepeatUpdate={onLogicRepeatUpdate}
          onLogicControlDelete={onLogicControlDelete}
          onLogicControlReorder={onLogicControlReorder}
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
