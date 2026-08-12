import { useEffect, useRef } from 'react';

import { projectSaveStatus } from '../projectSessionPresentation';

export type EditorMode = 'form' | 'blocks';

type ToolbarProps = {
  projectName: string;
  projectNameDraft: string;
  isRenamingProject: boolean;
  editorMode: EditorMode;
  isBusy: boolean;
  isDirty: boolean;
  isSaving: boolean;
  engineMessage: string;
  projectFilePath: string | null;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onBeginRenameProject: () => void;
  onProjectNameDraftChange: (name: string) => void;
  onCommitProjectName: () => Promise<boolean>;
  onCancelProjectName: () => void;
  onEditorModeChange: (mode: EditorMode) => void;
};

export function Toolbar({
  projectName,
  projectNameDraft,
  isRenamingProject,
  editorMode,
  isBusy,
  isDirty,
  isSaving,
  engineMessage,
  projectFilePath,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  onBeginRenameProject,
  onProjectNameDraftChange,
  onCommitProjectName,
  onCancelProjectName,
  onEditorModeChange,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function preserveRenameDraftFocus(
    event: React.MouseEvent<HTMLButtonElement>,
  ): void {
    // mousedown 先于 input blur。编辑名称时点击工具栏动作，不让 blur
    // 抢先发起重命名并把目标按钮置为 disabled；具体动作会自行提交或
    // 保留这份名称草稿。
    if (isRenamingProject) {
      event.preventDefault();
    }
  }

  useEffect(() => {
    if (isRenamingProject) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenamingProject]);

  const saveStatus = projectSaveStatus(isSaving, isDirty);

  return (
    <header className="toolbar">
      <div className="toolbar-main-row">
        <strong>VN Engine Editor</strong>

        <div className="project-file-actions" aria-label="项目文件操作">
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={onCreateProject}
          >
            新建
          </button>
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={onOpenProject}
          >
            打开
          </button>
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={onSaveProject}
          >
            保存
          </button>
        </div>

        <div
          className="toolbar-project-name"
          title={projectFilePath ?? '尚未保存到磁盘'}
        >
          <span>项目：</span>
          {isRenamingProject ? (
            <input
              ref={inputRef}
              value={projectNameDraft}
              disabled={isBusy}
              aria-label="项目名称"
              onChange={(event) =>
                onProjectNameDraftChange(event.target.value)
              }
              onBlur={() => void onCommitProjectName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void onCommitProjectName();
                } else if (event.key === 'Escape') {
                  onCancelProjectName();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="project-name-button"
              disabled={isBusy}
              title="点击修改项目名"
              onClick={onBeginRenameProject}
            >
              {projectName}
            </button>
          )}
          <span
            className={isDirty ? 'save-state is-dirty' : 'save-state'}
            aria-live="polite"
          >
            {saveStatus}
          </span>
        </div>

        <span
          className={engineMessage ? 'engine-error' : 'engine-ready'}
          aria-live="polite"
          title={engineMessage || undefined}
        >
          {engineMessage || (isBusy ? 'C++ 处理中…' : 'C++ 已连接')}
        </span>
      </div>

      <div className="toolbar-mode-row">
        <span className="toolbar-mode-label">编辑方式</span>
        <div
          className="editor-mode-switch"
          role="group"
          aria-label="编辑模式"
        >
          <button
            type="button"
            className="editor-mode-button"
            disabled={isBusy}
            aria-pressed={editorMode === 'form'}
            onClick={() => onEditorModeChange('form')}
          >
            表单编辑
          </button>
          <button
            type="button"
            className="editor-mode-button"
            disabled={isBusy}
            aria-pressed={editorMode === 'blocks'}
            onClick={() => onEditorModeChange('blocks')}
          >
            图形化编辑
          </button>
        </div>
      </div>
    </header>
  );
}
