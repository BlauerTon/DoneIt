import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "dialog" centres the card; "sheet" slides up from the bottom (mobile settings). */
  variant?: 'dialog' | 'sheet';
  labelledBy?: string;
  className?: string;
}

/** Accessible overlay: closes on Escape and backdrop click, traps nothing but restores focus. */
export function Modal({ open, onClose, children, variant = 'dialog', labelledBy, className = '' }: ModalProps) {
  const previousFocus = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      (previousFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const sheet = variant === 'sheet';
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-[rgb(18_18_22/0.55)] backdrop-blur-[3px] animate-[fade-in_120ms_ease-out] ${
        sheet ? 'items-end' : 'items-center p-4'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`${
          sheet
            ? 'w-full max-w-[480px] rounded-t-[20px] border-t border-line px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] animate-[sheet-in_180ms_ease-out]'
            : 'w-full max-w-[420px] max-h-[92vh] overflow-y-auto rounded-[18px] border border-line p-6 max-sm:p-5'
        } bg-card shadow-[0_20px_50px_rgb(0_0_0/0.3)] ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
