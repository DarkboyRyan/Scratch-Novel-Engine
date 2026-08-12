import { useRef, useState } from 'react';

import { ErrorDialog } from './components/ErrorDialog';
import { Toolbar, type EditorMode } from './components/Toolbar';
import { EMPTY_DIALOGUE_MESSAGE } from './editorMessages';
import { BlockEditor } from './features/block-editor/BlockEditor';
import type { BlockEditorLayoutStore } from './features/block-editor/blockEditorLayout';
import { FormEditor } from './features/form-editor/FormEditor';
import { useFormEditor } from './features/form-editor/useFormEditor';
import { useEngineProject } from './hooks/useEngineProject';

export default function App() {
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  // Blockly 会在切换到表单模式时卸载；布局提升到 App 后仍能保留。
  const blockEditorLayouts =
    useRef<BlockEditorLayoutStore>(new Map());
  const engine = useEngineProject();
  const editor = useFormEditor(engine);
  const { project, scene } = editor;

  if (!project || !scene) {
    return (
      <main className="engine-startup" role="status">
        <strong>VN Engine Editor</strong>
        <p>
          {editor.engineMessage || '正在启动 C++ 后端并创建项目……'}
        </p>
        {editor.engineMessage && (
          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            重新连接
          </button>
        )}
      </main>
    );
  }

  return (
    <div className="editor">
      <Toolbar
        projectName={project.name}
        editorMode={editorMode}
        isBusy={editor.isBusy}
        engineMessage={editor.engineMessage}
        onEditorModeChange={setEditorMode}
      />

      {editorMode === 'form' ? (
        <FormEditor editor={editor} />
      ) : (
        <BlockEditor
          project={project}
          scene={scene}
          layoutStore={blockEditorLayouts.current}
          onSceneChange={editor.selectScene}
          onDialogueUpdate={engine.updateDialogue}
          onDialogueAdd={engine.addDialogue}
          onDialogueReorder={engine.reorderDialogue}
          onDialoguesReorder={engine.reorderDialogues}
          onDialogueDelete={engine.deleteDialogues}
        />
      )}

      <ErrorDialog
        open={editor.engineMessage === EMPTY_DIALOGUE_MESSAGE}
        title="错误"
        message={EMPTY_DIALOGUE_MESSAGE}
        onConfirm={() => engine.setEngineMessage('')}
      />
    </div>
  );
}
