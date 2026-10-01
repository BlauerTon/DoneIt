import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-title">
      <h2 id="confirm-title" className="text-[17px] font-bold text-ink">
        {title}
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{message}</p>
      <div className="mt-5 flex justify-end gap-2.5">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          className={`btn ${danger ? 'bg-danger text-white hover:opacity-90 dark:text-[#16161B]' : 'btn-primary'}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
