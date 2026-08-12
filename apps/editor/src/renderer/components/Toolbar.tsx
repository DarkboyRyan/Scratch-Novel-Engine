export type EditorMode = 'form' | 'blocks';

type ToolbarProps = {
  projectName: string;
  editorMode: EditorMode;
  isBusy: boolean;
  engineMessage: string;
  onEditorModeChange: (mode: EditorMode) => void;
};

export function Toolbar({
  projectName,
  editorMode,
  isBusy,
  engineMessage,
  onEditorModeChange,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <strong>VN Engine Editor</strong>
      <span>Project: {projectName}</span>

      <div className="editor-mode-switch" role="group" aria-label="编辑模式">
        <button
          type="button"
          className="editor-mode-button"
          aria-pressed={editorMode === 'form'}
          onClick={() => onEditorModeChange('form')}
        >
          表单编辑
        </button>
        <button
          type="button"
          className="editor-mode-button"
          aria-pressed={editorMode === 'blocks'}
          onClick={() => onEditorModeChange('blocks')}
        >
          图形化编辑
        </button>
      </div>

      <span
        className={engineMessage ? 'engine-error' : 'engine-ready'}
        aria-live="polite"
      >
        {engineMessage || (isBusy ? 'C++ 处理中…' : 'C++ 已连接')}
      </span>
    </header>
  );
}
