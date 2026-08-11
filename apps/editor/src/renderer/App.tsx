import { useState } from 'react';

import { Toolbar, type EditorMode } from './components/Toolbar';
import { BlockEditor } from './features/block-editor/BlockEditor';
import { FormEditor } from './features/form-editor/FormEditor';
import { useFormEditor } from './features/form-editor/useFormEditor';
import { useEngineProject } from './hooks/useEngineProject';

export default function App() {
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
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
        <BlockEditor project={project} />
      )}
    </div>
  );
}
