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
  showDialogue: boolean;
  characters: PreviewCharacter[];
  isStartPreviewDisabled: boolean;
  onStartPreview: () => void;
};

export function FormEditor({
  editor,
  assets,
  backgroundUrl,
  backgroundName,
  showDialogue,
  characters,
  isStartPreviewDisabled,
  onStartPreview,
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
        onAddScene={editor.addScene}
        onSelectScene={editor.selectScene}
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
        showDialogue={showDialogue}
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
        isBusy={editor.isBusy}
        onSpeakerChange={editor.setSpeaker}
        onTextChange={editor.setText}
        onBackgroundChange={(assetId) =>
          editor.selectedBackground
            ? editor.updateBackgroundNode(
                editor.selectedBackground,
                assetId,
              )
            : Promise.resolve()
        }
        onCharacterChange={(next) =>
          editor.selectedCharacter
            ? editor.updateCharacterNode(editor.selectedCharacter, next)
            : Promise.resolve()
        }
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
