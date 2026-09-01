/**
 * 文件主要作用：组合场景表单、属性检查器、资源面板和预览面板。
 * 包含实现：`FormEditor`。
 */

import { PreviewPanel } from '../../components/PreviewPanel';
import type { PreviewCharacter } from '../../components/PreviewPanel';
import type { AssetDocument } from '../../../shared/projectTypes';
import { InspectorPanel } from './InspectorPanel';
import { ScenePanel } from './ScenePanel';
import type { FormEditorState } from './useFormEditor';

type FormEditorProps = {
  editor: FormEditorState;
  assets: AssetDocument[];
  backgroundUrl: string | null;
  backgroundName: string | null;
  backgroundScalePercent: number;
  cgUrl: string | null;
  cgName: string | null;
  showDialogue: boolean;
  logicPreviewUncertain: boolean;
  cgPreviewUncertain: boolean;
  characters: PreviewCharacter[];
  isStartPreviewDisabled: boolean;
  onStartPreview: () => void;
  onAddScene: () => Promise<void>;
  onSelectScene: (sceneId: string) => Promise<void>;
  onSelectStartScreen: () => Promise<void>;
  onSelectCgGallery: () => Promise<void>;
};

export function FormEditor({
  editor,
  assets,
  backgroundUrl,
  backgroundName,
  backgroundScalePercent,
  cgUrl,
  cgName,
  showDialogue,
  logicPreviewUncertain,
  cgPreviewUncertain,
  characters,
  isStartPreviewDisabled,
  onStartPreview,
  onAddScene,
  onSelectScene,
  onSelectStartScreen,
  onSelectCgGallery,
}: FormEditorProps) {
  const { project, scene } = editor;

  if (!project || !scene) {
    return null;
  }

  return (
    <>
      <ScenePanel
        project={project}
        scene={scene}
        assets={assets}
        selectedNodeId={editor.selectedNodeId}
        isBusy={editor.isBusy}
        onAddScene={onAddScene}
        editingSceneId={editor.editingSceneId}
        sceneNameDraft={editor.sceneNameDraft}
        sceneRenameError={editor.sceneRenameError}
        isRenamingScene={editor.isRenamingScene}
        onBeginSceneRename={editor.beginSceneRename}
        onSceneNameDraftChange={editor.setSceneNameDraft}
        onCancelSceneRename={editor.cancelSceneRename}
        onCommitSceneRename={editor.commitSceneRename}
        onSelectScene={onSelectScene}
        onSelectStartScreen={onSelectStartScreen}
        onSelectCgGallery={onSelectCgGallery}
        onSelectNode={editor.selectNode}
        onInsertBackground={editor.insertBackground}
        onInsertSceneJump={editor.insertSceneJump}
        onMoveNode={editor.moveNode}
        onDeleteNode={editor.deleteNode}
      />

      <PreviewPanel
        speaker={editor.previewSpeaker}
        text={editor.previewText}
        backgroundUrl={backgroundUrl}
        backgroundName={backgroundName}
        backgroundScalePercent={backgroundScalePercent}
        cgUrl={cgUrl}
        cgName={cgName}
        showDialogue={showDialogue}
        logicPreviewUncertain={logicPreviewUncertain}
        cgPreviewUncertain={cgPreviewUncertain}
        characters={characters}
        isStartDisabled={isStartPreviewDisabled}
        onStartPreview={onStartPreview}
      />

      <InspectorPanel
        selectedNode={editor.selectedNode}
        scenes={project.scenes}
        currentSceneId={scene.id}
        assets={assets}
        speaker={editor.speaker}
        text={editor.text}
        imageScaleDraft={editor.selectedImageScaleDraft}
        imageScaleDraftInvalid={editor.selectedImageScaleDraftInvalid}
        isBusy={editor.isBusy}
        onSpeakerChange={editor.setSpeaker}
        onTextChange={editor.setText}
        onImageScaleDraftChange={editor.setSelectedImageScaleDraft}
        onImageScaleDraftCommit={editor.commitSelectedImageScaleDraft}
        onBackgroundChange={async (next) => {
          if (editor.selectedBackground) {
            await editor.updateBackgroundNode(editor.selectedBackground, next);
          }
        }}
        onCharacterChange={async (next) => {
          if (editor.selectedCharacter) {
            await editor.updateCharacterNode(editor.selectedCharacter, next);
          }
        }}
        onSceneJumpChange={(targetSceneId) =>
          editor.selectedSceneJump
            ? editor.updateSceneJumpNode(
                editor.selectedSceneJump,
                targetSceneId,
              )
            : Promise.resolve()
        }
        onBgmChange={(assetId) =>
          editor.selectedBgm
            ? editor.updateBgmNode(editor.selectedBgm, assetId)
            : Promise.resolve()
        }
        onVideoChange={(assetId) =>
          editor.selectedVideo
            ? editor.updateVideoNode(editor.selectedVideo, assetId)
            : Promise.resolve()
        }
        onDialogueVoiceChange={(assetId) =>
          editor.selectedDialogue
            ? editor.updateDialogueVoice(editor.selectedDialogue, assetId)
            : Promise.resolve()
        }
        onInsertDialogue={editor.insertEmptyDialogue}
        onInsertCharacter={editor.insertCharacter}
        onInsertBgm={editor.insertBgm}
        onSubmit={editor.submitDialogue}
      />
    </>
  );
}
