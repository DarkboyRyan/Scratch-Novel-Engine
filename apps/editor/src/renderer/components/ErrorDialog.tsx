import { useEffect, useRef } from 'react';

type ErrorDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
};

export function ErrorDialog({
  open,
  title,
  message,
  onConfirm,
}: ErrorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && dialog.isConnected && !dialog.open) {
      dialog.showModal();
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
      className="error-dialog"
      aria-labelledby="error-dialog-title"
      aria-describedby="error-dialog-message"
      onCancel={(event) => {
        event.preventDefault();
        onConfirm();
      }}
    >
      <div className="error-dialog-content">
        <h2 id="error-dialog-title">{title}</h2>
        <p id="error-dialog-message">{message}</p>

        <button type="button" autoFocus onClick={onConfirm}>
          确认
        </button>
      </div>
    </dialog>
  );
}
