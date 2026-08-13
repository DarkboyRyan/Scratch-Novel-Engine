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
};

export function FormEditor({
  editor,
  assets,
  backgroundUrl,
  backgroundName,
  showDialogue,
  characters,
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
      />

      <InspectorPanel
        selectedNode={editor.selectedNode}
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
        onInsertDialogue={editor.insertEmptyDialogue}
        onInsertCharacter={editor.insertCharacter}
        onSubmit={editor.submitDialogue}
      />
    </>
  );
}
