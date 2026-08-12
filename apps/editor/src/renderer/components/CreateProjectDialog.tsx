import { useEffect, useRef } from 'react';

type CreateProjectDialogProps = {
  open: boolean;
  projectName: string;
  isBusy: boolean;
  onProjectNameChange: (name: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CreateProjectDialog({
  open,
  projectName,
  isBusy,
  onProjectNameChange,
  onCancel,
  onConfirm,
}: CreateProjectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && dialog.isConnected && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="create-project-dialog"
      aria-labelledby="create-project-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isBusy) {
            onConfirm();
          }
        }}
      >
        <h2 id="create-project-dialog-title">新建项目</h2>
        <label htmlFor="new-project-name">项目名称</label>
        <input
          ref={inputRef}
          id="new-project-name"
          value={projectName}
          disabled={isBusy}
          maxLength={120}
          autoComplete="off"
          onChange={(event) => onProjectNameChange(event.target.value)}
        />

        <div className="create-project-dialog-actions">
          <button type="button" disabled={isBusy} onClick={onCancel}>
            取消
          </button>
          <button type="submit" disabled={isBusy}>
            {isBusy ? '正在创建…' : '创建新窗口'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
