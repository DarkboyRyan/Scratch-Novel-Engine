import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { useEditorLabels } from '../i18n/editorLocalization';

type EditorSettingsDialogProps = {
  language: EditorLanguage;
  isSaving: boolean;
  saveFailed: boolean;
  restartRequired: boolean;
  onLanguageChange: (language: EditorLanguage) => Promise<void>;
  onClose: () => void;
};

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not(:disabled), select:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('hidden'));
}

export function EditorSettingsDialog({
  language,
  isSaving,
  saveFailed,
  restartRequired,
  onLanguageChange,
  onClose,
}: EditorSettingsDialogProps) {
  const labels = useEditorLabels();
  const titleId = useId();
  const restartRequiredId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const languageRef = useRef<HTMLSelectElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(isSaving);
  closeRef.current = onClose;
  savingRef.current = isSaving;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusInitialControl = (): void => {
      (
        restartRequired
          ? closeButtonRef.current ?? dialogRef.current
          : languageRef.current ?? dialogRef.current
      )?.focus();
    };
    queueMicrotask(focusInitialControl);

    const handleKeyDown = (event: KeyboardEvent): void => {
      const dialog = dialogRef.current;
      if (dialog === null) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!savingRef.current) {
          closeRef.current();
        }
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const currentIndex = document.activeElement instanceof HTMLElement
        ? focusable.indexOf(document.activeElement)
        : -1;
      const nextIndex = event.shiftKey
        ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
        : currentIndex < 0 || currentIndex === focusable.length - 1
          ? 0
          : currentIndex + 1;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      queueMicrotask(() => {
        if (
          previouslyFocused?.isConnected &&
          !previouslyFocused.matches(':disabled') &&
          previouslyFocused.closest('[inert]') === null
        ) {
          previouslyFocused.focus();
        }
      });
    };
  }, [restartRequired]);

  return createPortal(
    <div
      className="export-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="export-dialog editor-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={isSaving || undefined}
        tabIndex={-1}
      >
        <h2 id={titleId}>{labels.settings.title}</h2>
        <label>
          <span>{labels.settings.interfaceLanguage}</span>
          <select
            ref={languageRef}
            aria-label={labels.settings.interfaceLanguage}
            aria-describedby={restartRequired ? restartRequiredId : undefined}
            value={language}
            disabled={isSaving || restartRequired}
            onChange={(event) => {
              void onLanguageChange(event.target.value as EditorLanguage);
            }}
          >
            <option value="zh-CN">{labels.settings.chinese}</option>
            <option value="en-US">{labels.settings.english}</option>
          </select>
        </label>
        {restartRequired ? (
          <p
            id={restartRequiredId}
            className="export-dialog-error"
            role="alert"
          >
            {labels.settings.restartRequired}
          </p>
        ) : isSaving ? (
          <p className="editor-settings-status" role="status">
            {labels.settings.saving}
          </p>
        ) : null}
        {saveFailed ? (
          <p className="export-dialog-error" role="alert">
            {labels.settings.saveFailed}
          </p>
        ) : null}
        <div className="export-dialog-actions">
          <button
            ref={closeButtonRef}
            type="button"
            disabled={isSaving}
            onClick={onClose}
          >
            {labels.common.close}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
