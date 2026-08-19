import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  standaloneApplicationMetadataError,
  type GameExportRequest,
} from '../../shared/exportProtocol';
import type { EditorMode } from '../application/editorMode';
import { projectSaveStatus } from '../projectSessionPresentation';

type ToolbarProps = {
  projectName: string;
  projectNameDraft: string;
  isRenamingProject: boolean;
  editorMode: EditorMode;
  isBusy: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isExporting: boolean;
  engineMessage: string;
  operationMessage: string;
  projectFolderName: string | null;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onExportGame: (request: GameExportRequest) => void;
  onBeginRenameProject: () => void;
  onProjectNameDraftChange: (name: string) => void;
  onCommitProjectName: () => Promise<boolean>;
  onCancelProjectName: () => void;
  onEditorModeChange: (mode: EditorMode) => void;
};

function defaultApplicationId(projectName: string): string {
  const suffix = projectName
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return `com.vnengine.${suffix.length > 0 ? suffix : 'game'}`;
}

export function Toolbar({
  projectName,
  projectNameDraft,
  isRenamingProject,
  editorMode,
  isBusy,
  isDirty,
  isSaving,
  isExporting,
  engineMessage,
  operationMessage,
  projectFolderName,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  onExportGame,
  onBeginRenameProject,
  onProjectNameDraftChange,
  onCommitProjectName,
  onCancelProjectName,
  onEditorModeChange,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportOutput, setExportOutput] = useState<GameExportRequest['output']>(
    'runtime-bundle',
  );
  const [applicationName, setApplicationName] = useState(projectName);
  const [applicationVersion, setApplicationVersion] = useState('1.0.0');
  const [applicationId, setApplicationId] = useState(
    defaultApplicationId(projectName),
  );
  const [exportConfigurationError, setExportConfigurationError] = useState('');

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

  useEffect(() => {
    if (!isExportDialogOpen) {
      setApplicationName(projectName);
      setApplicationId(defaultApplicationId(projectName));
    }
  }, [isExportDialogOpen, projectName]);

  function submitExportConfiguration(): void {
    if (exportOutput === 'runtime-bundle') {
      setIsExportDialogOpen(false);
      setExportConfigurationError('');
      onExportGame({ output: 'runtime-bundle' });
      return;
    }
    const application = {
      name: applicationName,
      version: applicationVersion,
      applicationId,
    };
    const error = standaloneApplicationMetadataError(application);
    if (error !== null) {
      setExportConfigurationError(error);
      return;
    }
    setIsExportDialogOpen(false);
    setExportConfigurationError('');
    onExportGame({ output: 'standalone-application', application });
  }

  const saveStatus = projectSaveStatus(isSaving, isDirty);

  return (
    <header className="toolbar">
      <div className="toolbar-main-row">
        <strong>Scratch Novel Engine</strong>

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
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => {
              setExportConfigurationError('');
              setIsExportDialogOpen(true);
            }}
          >
            {isExporting ? '导出中…' : '导出'}
          </button>
        </div>

        {isExportDialogOpen
          ? createPortal(
              <div
            className="export-dialog-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsExportDialogOpen(false);
              }
            }}
          >
            <section
              className="export-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-dialog-title"
            >
              <h2 id="export-dialog-title">导出</h2>
              <label>
                <span>产物类型</span>
                <select
                  aria-label="产物类型"
                  value={exportOutput}
                  onChange={(event) => {
                    setExportOutput(
                      event.target.value as GameExportRequest['output'],
                    );
                    setExportConfigurationError('');
                  }}
                >
                  <option value="runtime-bundle">.vngame 内容包</option>
                  <option value="standalone-application">
                    独立游戏 ZIP（macOS）
                  </option>
                </select>
              </label>

              {exportOutput === 'standalone-application' ? (
                <div className="export-application-fields">
                  <label>
                    <span>应用名称</span>
                    <input
                      aria-label="应用名称"
                      value={applicationName}
                      maxLength={80}
                      onChange={(event) => setApplicationName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>版本</span>
                    <input
                      aria-label="应用版本"
                      value={applicationVersion}
                      maxLength={32}
                      onChange={(event) => setApplicationVersion(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Application ID</span>
                    <input
                      aria-label="Application ID"
                      value={applicationId}
                      maxLength={155}
                      spellCheck={false}
                      onChange={(event) => setApplicationId(event.target.value)}
                    />
                  </label>
                  <p className="export-dialog-note">
                    ZIP 内含一个可运行的 macOS 应用，并使用 Player
                    模板默认图标。Windows/Linux、自定义图标和正式签名由对应平台
                    CI 完成。
                  </p>
                </div>
              ) : null}

              {exportConfigurationError ? (
                <p className="export-dialog-error" role="alert">
                  {exportConfigurationError}
                </p>
              ) : null}
              <div className="export-dialog-actions">
                <button
                  type="button"
                  onClick={() => setIsExportDialogOpen(false)}
                >
                  取消
                </button>
                <button type="button" onClick={submitExportConfiguration}>
                  导出
                </button>
              </div>
            </section>
              </div>,
              document.body,
            )
          : null}

        <div
          className="toolbar-project-name"
          title={
            projectFolderName
              ? `项目文件夹：${projectFolderName}`
              : '尚未保存到磁盘'
          }
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
          title={engineMessage || operationMessage || undefined}
        >
          {engineMessage ||
            operationMessage ||
            (isBusy ? '处理中…' : '已连接')}
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
