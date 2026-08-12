import { PreviewPanel } from '../../components/PreviewPanel';
import { InspectorPanel } from './InspectorPanel';
import { ScenePanel } from './ScenePanel';
import type { FormEditorState } from './useFormEditor';

type FormEditorProps = {
  editor: FormEditorState;
  backgroundUrl: string | null;
  backgroundName: string | null;
};

export function FormEditor({
  editor,
  backgroundUrl,
  backgroundName,
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
        selectedNodeId={editor.selectedNodeId}
        isBusy={editor.isBusy}
        onAddScene={editor.addScene}
        onSelectScene={editor.selectScene}
        onSelectNode={editor.selectNode}
        onMoveDialogue={editor.moveDialogue}
        onDeleteDialogue={editor.deleteDialogue}
      />

      <PreviewPanel
        speaker={editor.previewSpeaker}
        text={editor.previewText}
        backgroundUrl={backgroundUrl}
        backgroundName={backgroundName}
      />

      <InspectorPanel
        selectedNode={editor.selectedNode}
        speaker={editor.speaker}
        text={editor.text}
        isBusy={editor.isBusy}
        onSpeakerChange={editor.setSpeaker}
        onTextChange={editor.setText}
        onInsertEmptyDialogue={editor.insertEmptyDialogue}
        onSubmit={editor.submitDialogue}
      />
    </>
  );
}
