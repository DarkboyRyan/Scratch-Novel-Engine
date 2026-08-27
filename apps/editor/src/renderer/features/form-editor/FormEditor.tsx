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
  cgUrl: string | null;
  cgName: string | null;
  showDialogue: boolean;
  logicPreviewUncertain: boolean;
  cgPreviewUncertain: boolean;
  characters: PreviewCharacter[];
  isStartPreviewDisabled: boolean;
  onStartPreview: () => void;
  onSelectStartScreen: () => Promise<void>;
  onSelectCgGallery: () => Promise<void>;
};

export function FormEditor({
  editor,
  assets,
  backgroundUrl,
  backgroundName,
  cgUrl,
  cgName,
  showDialogue,
  logicPreviewUncertain,
  cgPreviewUncertain,
  characters,
  isStartPreviewDisabled,
  onStartPreview,
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
        onAddScene={editor.addScene}
        onSelectScene={editor.selectScene}
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
