/**
 * 文件主要作用：提供项目、编辑模式、导出和编辑器设置等顶部操作。
 * 包含实现：`Toolbar`。
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  standaloneApplicationMetadataErrorCode,
  type GameExportRequest,
  type StandaloneApplicationMetadataErrorCode,
} from '../../shared/exportProtocol';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import type { EditorMode } from '../application/editorMode';
import type { WorkspaceSection } from '../application/editorSection';
import { useEditorLabels } from '../i18n/editorLocalization';
import { EditorSettingsDialog } from './EditorSettingsDialog';

type ToolbarProps = {
  projectName: string;
  projectNameDraft: string;
  isRenamingProject: boolean;
  editorMode: EditorMode;
  workspaceSection: WorkspaceSection;
  isBusy: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isExporting: boolean;
  engineMessage: string;
  operationMessage: string;
  projectFolderName: string | null;
  language: EditorLanguage;
  isSettingsSaving: boolean;
  settingsSaveFailed: boolean;
  settingsRestartRequired: boolean;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onExportGame: (request: GameExportRequest) => void;
  onBeginRenameProject: () => void;
  onProjectNameDraftChange: (name: string) => void;
  onCommitProjectName: () => Promise<boolean>;
  onCancelProjectName: () => void;
  onWorkspaceSectionChange: (section: WorkspaceSection) => void;
  onEditorModeChange: (mode: EditorMode) => void;
  onLanguageChange: (language: EditorLanguage) => Promise<void>;
  onOpenSettings: () => void;
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
  workspaceSection,
  isBusy,
  isDirty,
  isSaving,
  isExporting,
  engineMessage,
  operationMessage,
  projectFolderName,
  language,
  isSettingsSaving,
  settingsSaveFailed,
  settingsRestartRequired,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  onExportGame,
  onBeginRenameProject,
  onProjectNameDraftChange,
  onCommitProjectName,
  onCancelProjectName,
  onWorkspaceSectionChange,
  onEditorModeChange,
  onLanguageChange,
  onOpenSettings,
}: ToolbarProps) {
  const labels = useEditorLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [exportOutput, setExportOutput] = useState<GameExportRequest['output']>(
    'runtime-bundle',
  );
  const [applicationName, setApplicationName] = useState(projectName);
  const [applicationVersion, setApplicationVersion] = useState('1.0.0');
  const [applicationId, setApplicationId] = useState(
    defaultApplicationId(projectName),
  );
  const [exportConfigurationError, setExportConfigurationError] =
    useState<StandaloneApplicationMetadataErrorCode | null>(null);
  const toolbarStatusMessage =
    engineMessage ||
    operationMessage ||
    (isBusy ? labels.toolbar.processing : '');

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
    if (exportOutput !== 'standalone-application') {
      setIsExportDialogOpen(false);
      setExportConfigurationError(null);
      onExportGame({ output: exportOutput });
      return;
    }
    const application = {
      name: applicationName,
      version: applicationVersion,
      applicationId,
    };
    const error = standaloneApplicationMetadataErrorCode(application);
    if (error !== null) {
      setExportConfigurationError(error);
      return;
    }
    setIsExportDialogOpen(false);
    setExportConfigurationError(null);
    onExportGame({ output: 'standalone-application', application });
  }

  const saveStatus = isSaving
    ? labels.toolbar.saving
    : isDirty
      ? labels.toolbar.unsaved
      : labels.toolbar.saved;

  return (
    <header className="toolbar">
      <div className="toolbar-main-row">
        <strong>Scratch Novel Engine</strong>

        <div
          className="project-file-actions"
          aria-label={labels.toolbar.projectFileActions}
        >
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={onCreateProject}
          >
            {labels.toolbar.create}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={onOpenProject}
          >
            {labels.toolbar.open}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={onSaveProject}
          >
            {labels.toolbar.save}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => {
              setIsSettingsDialogOpen(false);
              setExportConfigurationError(null);
              setIsExportDialogOpen(true);
            }}
          >
            {isExporting ? labels.toolbar.exporting : labels.toolbar.export}
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => {
              setIsExportDialogOpen(false);
              setExportConfigurationError(null);
              onOpenSettings();
              setIsSettingsDialogOpen(true);
            }}
          >
            {labels.settings.button}
          </button>
        </div>

        {isSettingsDialogOpen ? (
          <EditorSettingsDialog
            language={language}
            isSaving={isSettingsSaving}
            saveFailed={settingsSaveFailed}
            restartRequired={settingsRestartRequired}
            onLanguageChange={onLanguageChange}
            onClose={() => setIsSettingsDialogOpen(false)}
          />
        ) : null}

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
              <h2 id="export-dialog-title">{labels.toolbar.exportTitle}</h2>
              <label>
                <span>{labels.toolbar.artifactType}</span>
                <select
                  aria-label={labels.toolbar.artifactType}
                  value={exportOutput}
                  onChange={(event) => {
                    setExportOutput(
                      event.target.value as GameExportRequest['output'],
                    );
                    setExportConfigurationError(null);
                  }}
                >
                  <option value="runtime-bundle">{labels.toolbar.runtimeBundle}</option>
                  <option value="web-player">{labels.toolbar.webPlayer}</option>
                  <option value="standalone-application">
                    {labels.toolbar.standalonePlayer}
                  </option>
                </select>
              </label>

              {exportOutput === 'standalone-application' ? (
                <div className="export-application-fields">
                  <label>
                    <span>{labels.toolbar.applicationName}</span>
                    <input
                      aria-label={labels.toolbar.applicationName}
                      value={applicationName}
                      maxLength={80}
                      onChange={(event) => setApplicationName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{labels.toolbar.applicationVersion}</span>
                    <input
                      aria-label={labels.toolbar.applicationVersionAria}
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
                    {labels.toolbar.standaloneHelp}
                  </p>
                </div>
              ) : null}

              {exportOutput === 'web-player' ? (
                <p className="export-dialog-note">
                  {labels.toolbar.webHelp}
                </p>
              ) : null}

              {exportConfigurationError ? (
                <p className="export-dialog-error" role="alert">
                  {exportConfigurationError === 'application-name-invalid'
                    ? labels.toolbar.applicationNameInvalid
                    : exportConfigurationError === 'application-version-invalid'
                      ? labels.toolbar.applicationVersionInvalid
                      : labels.toolbar.applicationIdInvalid}
                </p>
              ) : null}
              <div className="export-dialog-actions">
                <button
                  type="button"
                  onClick={() => setIsExportDialogOpen(false)}
                >
                  {labels.common.cancel}
                </button>
                <button type="button" onClick={submitExportConfiguration}>
                  {labels.toolbar.export}
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
              ? `${labels.toolbar.projectFolder}: ${projectFolderName}`
              : labels.toolbar.notSavedToDisk
          }
        >
          <span>{labels.toolbar.project}: </span>
          {isRenamingProject ? (
            <input
              ref={inputRef}
              value={projectNameDraft}
              disabled={isBusy}
              aria-label={labels.toolbar.projectName}
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
              title={labels.toolbar.editProjectName}
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
          className={
            toolbarStatusMessage
              ? engineMessage
                ? 'engine-error'
                : 'engine-ready'
              : 'toolbar-status-live'
          }
          aria-live="polite"
          aria-atomic="true"
          title={engineMessage || operationMessage || undefined}
        >
          {toolbarStatusMessage}
        </span>
      </div>

      <div className="toolbar-mode-row">
        <span className="toolbar-mode-label">
          {labels.toolbar.workspace}
        </span>
        <div
          className="editor-mode-switch"
          role="group"
          data-toolbar-switch="workspace"
          aria-label={labels.toolbar.workspaceSection}
        >
          <button
            type="button"
            className="editor-mode-button"
            disabled={isBusy}
            aria-pressed={workspaceSection === 'dialogue'}
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => onWorkspaceSectionChange('dialogue')}
          >
            {labels.toolbar.dialogueWorkspace}
          </button>
          <button
            type="button"
            className="editor-mode-button"
            disabled={isBusy}
            aria-pressed={workspaceSection === 'resources'}
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => onWorkspaceSectionChange('resources')}
          >
            {labels.toolbar.resourceManager}
          </button>
        </div>

        <span className="toolbar-mode-label">
          {labels.toolbar.editMethod}
        </span>
        <div
          className="editor-mode-switch"
          role="group"
          data-toolbar-switch="editor-mode"
          aria-label={labels.toolbar.editorMode}
        >
          <button
            type="button"
            className="editor-mode-button"
            disabled={isBusy || workspaceSection !== 'dialogue'}
            aria-pressed={editorMode === 'form'}
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => onEditorModeChange('form')}
          >
            {labels.toolbar.formEditor}
          </button>
          <button
            type="button"
            className="editor-mode-button"
            disabled={isBusy || workspaceSection !== 'dialogue'}
            aria-pressed={editorMode === 'blocks'}
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => onEditorModeChange('blocks')}
          >
            {labels.toolbar.blockEditor}
          </button>
          <button
            type="button"
            className="editor-mode-button"
            disabled={isBusy || workspaceSection !== 'dialogue'}
            aria-pressed={editorMode === 'code'}
            onMouseDown={preserveRenameDraftFocus}
            onClick={() => onEditorModeChange('code')}
          >
            {labels.toolbar.codePreview}
          </button>
        </div>
      </div>
    </header>
  );
}
